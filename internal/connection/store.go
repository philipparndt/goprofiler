package connection

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/philipparndt/go-logger"
)

type Status string

const (
	StatusConnected   Status = "connected"
	StatusUnreachable Status = "unreachable"
	StatusSaved       Status = "saved"
)

type Language string

const (
	LangGo   Language = "go"
	LangJava Language = "java"
)

type Target struct {
	ID               string     `json:"id"`
	URL              string     `json:"url"`
	Status           Status     `json:"status"`
	Language         Language   `json:"language"`
	ConnectionMethod string     `json:"connectionMethod,omitempty"` // "pprof", "jmx", "async-profiler"
	LastCheck        *time.Time `json:"lastCheck,omitempty"`
	LastConnected    *time.Time `json:"lastConnected,omitempty"`
	Label            string     `json:"label,omitempty"`
	SourceDir        string     `json:"sourceDir,omitempty"`
	LocalPid         int        `json:"localPid,omitempty"`
	JavaMainClass    string     `json:"javaMainClass,omitempty"`
	K8sContext       string     `json:"k8sContext,omitempty"`
	K8sNamespace     string     `json:"k8sNamespace,omitempty"`
	K8sPod           string     `json:"k8sPod,omitempty"`
	K8sPort          int        `json:"k8sPort,omitempty"`
}

// savedTarget is the JSON-persisted form.
type savedTarget struct {
	ID               string    `json:"id"`
	URL              string    `json:"url"`
	Language         Language  `json:"language"`
	ConnectionMethod string    `json:"connectionMethod,omitempty"`
	Label            string    `json:"label,omitempty"`
	LastConnected    time.Time `json:"lastConnected"`
	SourceDir        string    `json:"sourceDir,omitempty"`
	LocalPid         int       `json:"localPid,omitempty"`
	JavaMainClass    string    `json:"javaMainClass,omitempty"`
	K8sContext       string    `json:"k8sContext,omitempty"`
	K8sNamespace     string    `json:"k8sNamespace,omitempty"`
	K8sPod           string    `json:"k8sPod,omitempty"`
	K8sPort          int       `json:"k8sPort,omitempty"`
}

type Store struct {
	mu       sync.RWMutex
	active   map[string]*Target // connected targets
	saved    map[string]*Target // saved but not connected
	client   *http.Client
	cancel   context.CancelFunc
	filePath string

	OnConnect    func(id, url string) // called after a target connects
	OnDisconnect func(id string)      // called after a target disconnects

	// ValidateJava is called to health-check Java targets. Set by the app layer.
	ValidateJava func(url string) error
}

func NewStore(configDir string) (*Store, error) {
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return nil, fmt.Errorf("create config dir: %w", err)
	}

	s := &Store{
		active:   make(map[string]*Target),
		saved:    make(map[string]*Target),
		client:   &http.Client{Timeout: 5 * time.Second},
		filePath: filepath.Join(configDir, "connections.json"),
	}

	s.loadFromFile()

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	go s.healthCheckLoop(ctx)

	return s, nil
}

func (s *Store) Close() {
	s.cancel()
}

func (s *Store) Connect(rawURL string) (*Target, error) {
	rawURL = strings.TrimRight(rawURL, "/")

	if err := s.validatePprof(rawURL); err != nil {
		return nil, err
	}

	now := time.Now()

	s.mu.Lock()
	// Note: manually unlocked before callbacks to avoid holding lock during callback

	// Check if this URL is already saved — reuse its ID
	for id, t := range s.saved {
		if t.URL == rawURL {
			t.Status = StatusConnected
			t.LastCheck = &now
			t.LastConnected = &now
			s.active[id] = t
			delete(s.saved, id)
			s.persist()
			s.mu.Unlock()
			logger.Info("target reconnected", "id", id, "url", rawURL)
			if s.OnConnect != nil {
				s.OnConnect(id, rawURL)
			}
			return t, nil
		}
	}

	// Check if already active
	for _, t := range s.active {
		if t.URL == rawURL {
			copy := *t
			s.mu.Unlock()
			return &copy, nil
		}
	}

	t := &Target{
		ID:               uuid.New().String(),
		URL:              rawURL,
		Language:         LangGo,
		ConnectionMethod: "pprof",
		Status:           StatusConnected,
		LastCheck:        &now,
		LastConnected:    &now,
	}
	s.active[t.ID] = t
	s.persist()
	s.mu.Unlock()

	logger.Info("target connected", "id", t.ID, "url", t.URL)
	if s.OnConnect != nil {
		s.OnConnect(t.ID, t.URL)
	}
	return t, nil
}

// ConnectJava adds a Java target to the active set.
func (s *Store) ConnectJava(url string, method string) (*Target, error) {
	url = strings.TrimRight(url, "/")
	now := time.Now()

	s.mu.Lock()

	// Check if this URL is already saved — reuse its ID
	for id, t := range s.saved {
		if t.URL == url && t.Language == LangJava {
			t.Status = StatusConnected
			t.LastCheck = &now
			t.LastConnected = &now
			t.ConnectionMethod = method
			s.active[id] = t
			delete(s.saved, id)
			s.persist()
			s.mu.Unlock()
			logger.Info("java target reconnected", "id", id, "url", url)
			if s.OnConnect != nil {
				s.OnConnect(id, url)
			}
			return t, nil
		}
	}

	// Check if already active
	for _, t := range s.active {
		if t.URL == url && t.Language == LangJava {
			copy := *t
			s.mu.Unlock()
			return &copy, nil
		}
	}

	t := &Target{
		ID:               uuid.New().String(),
		URL:              url,
		Language:         LangJava,
		ConnectionMethod: method,
		Status:           StatusConnected,
		LastCheck:        &now,
		LastConnected:    &now,
	}
	s.active[t.ID] = t
	s.persist()
	s.mu.Unlock()

	logger.Info("java target connected", "id", t.ID, "url", t.URL, "method", method)
	if s.OnConnect != nil {
		s.OnConnect(t.ID, t.URL)
	}
	return t, nil
}

// Disconnect moves a target from active to saved.
func (s *Store) Disconnect(id string) error {
	s.mu.Lock()

	t, ok := s.active[id]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("target not found: %s", id)
	}

	t.Status = StatusSaved
	s.saved[id] = t
	delete(s.active, id)
	s.persist()
	s.mu.Unlock()

	logger.Info("target disconnected (saved)", "id", id, "url", t.URL)
	if s.OnDisconnect != nil {
		s.OnDisconnect(id)
	}
	return nil
}

// Reconnect moves a saved target back to active after validating the endpoint.
func (s *Store) Reconnect(id string) (*Target, error) {
	s.mu.RLock()
	t, ok := s.saved[id]
	if !ok {
		s.mu.RUnlock()
		return nil, fmt.Errorf("saved target not found: %s", id)
	}
	url := t.URL
	lang := t.Language
	s.mu.RUnlock()

	var err error
	if lang == LangJava && s.ValidateJava != nil {
		err = s.ValidateJava(url)
	} else {
		err = s.validatePprof(url)
	}
	if err != nil {
		return nil, err
	}

	now := time.Now()

	s.mu.Lock()

	t, ok = s.saved[id]
	if !ok {
		s.mu.Unlock()
		return nil, fmt.Errorf("saved target not found: %s", id)
	}

	t.Status = StatusConnected
	t.LastCheck = &now
	t.LastConnected = &now
	s.active[id] = t
	delete(s.saved, id)
	s.persist()
	s.mu.Unlock()

	logger.Info("target reconnected", "id", id, "url", url)
	if s.OnConnect != nil {
		s.OnConnect(id, url)
	}
	copy := *t
	return &copy, nil
}

// Remove permanently deletes a saved target.
func (s *Store) Remove(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.saved[id]; !ok {
		return fmt.Errorf("saved target not found: %s", id)
	}

	delete(s.saved, id)
	s.persist()

	logger.Info("target removed", "id", id)
	return nil
}

// IsK8s returns whether the target was connected via Kubernetes.
func (t *Target) IsK8s() bool {
	return t.K8sPod != ""
}

// GetSaved returns a saved target by ID.
func (s *Store) GetSaved(id string) (*Target, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.saved[id]
	if !ok {
		return nil, false
	}
	copy := *t
	return &copy, true
}

func (s *Store) SetLabel(id, label string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.active[id]; ok {
		t.Label = label
		s.persist()
	}
}

func (s *Store) UpdateURL(id, newURL string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.saved[id]; ok {
		t.URL = newURL
		s.persist()
	}
	if t, ok := s.active[id]; ok {
		t.URL = newURL
		s.persist()
	}
}

func (s *Store) SetK8sInfo(id, k8sContext, namespace, pod string, port int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.active[id]; ok {
		t.K8sContext = k8sContext
		t.K8sNamespace = namespace
		t.K8sPod = pod
		t.K8sPort = port
		s.persist()
	}
}

func (s *Store) SetLocalPid(id string, pid int, mainClass string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if t, ok := s.active[id]; ok {
		t.LocalPid = pid
		t.JavaMainClass = mainClass
		s.persist()
	}
}

func (s *Store) SetSourceDir(id, dir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if t, ok := s.active[id]; ok {
		t.SourceDir = dir
		s.persist()
		return nil
	}
	if t, ok := s.saved[id]; ok {
		t.SourceDir = dir
		s.persist()
		return nil
	}
	return fmt.Errorf("target not found: %s", id)
}

func (s *Store) Get(id string) (*Target, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.active[id]
	if !ok {
		return nil, false
	}
	copy := *t
	return &copy, true
}

func (s *Store) List() []*Target {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Target, 0, len(s.active))
	for _, t := range s.active {
		copy := *t
		result = append(result, &copy)
	}
	return result
}

func (s *Store) ListSaved() []*Target {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Target, 0, len(s.saved))
	for _, t := range s.saved {
		copy := *t
		result = append(result, &copy)
	}
	return result
}

func (s *Store) validatePprof(baseURL string) error {
	resp, err := s.client.Get(baseURL + "/debug/pprof/")
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("endpoint returned status %d", resp.StatusCode)
	}

	return nil
}

// loadFromFile reads saved targets from the JSON file. All loaded targets start as "saved".
func (s *Store) loadFromFile() {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if !os.IsNotExist(err) {
			logger.Warn("failed to read connections file", "path", s.filePath, "error", err)
		}
		return
	}

	var targets []savedTarget
	if err := json.Unmarshal(data, &targets); err != nil {
		logger.Warn("malformed connections file, starting empty", "path", s.filePath, "error", err)
		return
	}

	for _, st := range targets {
		lc := st.LastConnected
		lang := st.Language
		if lang == "" {
			lang = LangGo // default existing connections to Go
		}
		s.saved[st.ID] = &Target{
			ID:               st.ID,
			URL:              st.URL,
			Language:         lang,
			ConnectionMethod: st.ConnectionMethod,
			Label:            st.Label,
			Status:           StatusSaved,
			LastConnected:    &lc,
			SourceDir:        st.SourceDir,
			LocalPid:         st.LocalPid,
			JavaMainClass:    st.JavaMainClass,
			K8sContext:       st.K8sContext,
			K8sNamespace:     st.K8sNamespace,
			K8sPod:           st.K8sPod,
			K8sPort:          st.K8sPort,
		}
	}

	logger.Info("loaded saved connections", "count", len(targets))
}

// persist writes all known targets (active + saved) to the JSON file atomically.
// Must be called with s.mu held.
func (s *Store) persist() {
	var targets []savedTarget

	for _, t := range s.active {
		lc := time.Now()
		if t.LastConnected != nil {
			lc = *t.LastConnected
		}
		targets = append(targets, savedTarget{
			ID:               t.ID,
			URL:              t.URL,
			Language:         t.Language,
			ConnectionMethod: t.ConnectionMethod,
			Label:            t.Label,
			LastConnected:    lc,
			SourceDir:        t.SourceDir,
			LocalPid:         t.LocalPid,
			JavaMainClass:    t.JavaMainClass,
			K8sContext:       t.K8sContext,
			K8sNamespace:     t.K8sNamespace,
			K8sPod:           t.K8sPod,
			K8sPort:          t.K8sPort,
		})
	}
	for _, t := range s.saved {
		lc := time.Now()
		if t.LastConnected != nil {
			lc = *t.LastConnected
		}
		targets = append(targets, savedTarget{
			ID:               t.ID,
			URL:              t.URL,
			Language:         t.Language,
			ConnectionMethod: t.ConnectionMethod,
			Label:            t.Label,
			LastConnected:    lc,
			SourceDir:        t.SourceDir,
			LocalPid:         t.LocalPid,
			JavaMainClass:    t.JavaMainClass,
			K8sContext:       t.K8sContext,
			K8sNamespace:     t.K8sNamespace,
			K8sPod:           t.K8sPod,
			K8sPort:          t.K8sPort,
		})
	}

	data, err := json.MarshalIndent(targets, "", "  ")
	if err != nil {
		logger.Error("failed to marshal connections", "error", err)
		return
	}

	// Atomic write: write to temp file then rename
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		logger.Error("failed to write connections file", "error", err)
		return
	}
	if err := os.Rename(tmp, s.filePath); err != nil {
		logger.Error("failed to rename connections file", "error", err)
	}
}

func (s *Store) healthCheckLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.mu.RLock()
			ids := make([]string, 0, len(s.active))
			for id := range s.active {
				ids = append(ids, id)
			}
			s.mu.RUnlock()

			for _, id := range ids {
				s.mu.RLock()
				t, ok := s.active[id]
				if !ok {
					s.mu.RUnlock()
					continue
				}
				url := t.URL
				lang := t.Language
				s.mu.RUnlock()

				var err error
				if lang == LangJava && s.ValidateJava != nil {
					err = s.ValidateJava(url)
				} else {
					err = s.validatePprof(url)
				}
				now := time.Now()

				s.mu.Lock()
				if t, ok := s.active[id]; ok {
					t.LastCheck = &now
					if err != nil {
						if t.Status != StatusUnreachable {
							logger.Warn("target unreachable", "id", id, "url", url, "error", err)
						}
						t.Status = StatusUnreachable
					} else {
						if t.Status != StatusConnected {
							logger.Info("target recovered", "id", id, "url", url)
						}
						t.Status = StatusConnected
					}
				}
				s.mu.Unlock()
			}
		}
	}
}
