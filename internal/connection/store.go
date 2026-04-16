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
	vlog "github1.vg.vector.int/pes/vehub-vlog-go"
)

type Status string

const (
	StatusConnected   Status = "connected"
	StatusUnreachable Status = "unreachable"
	StatusSaved       Status = "saved"
)

type Target struct {
	ID            string     `json:"id"`
	URL           string     `json:"url"`
	Status        Status     `json:"status"`
	LastCheck     *time.Time `json:"lastCheck,omitempty"`
	LastConnected *time.Time `json:"lastConnected,omitempty"`
	Label         string     `json:"label,omitempty"`
}

// savedTarget is the JSON-persisted form.
type savedTarget struct {
	ID            string    `json:"id"`
	URL           string    `json:"url"`
	Label         string    `json:"label,omitempty"`
	LastConnected time.Time `json:"lastConnected"`
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
			vlog.Info("target reconnected", "id", id, "url", rawURL)
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
		ID:            uuid.New().String(),
		URL:           rawURL,
		Status:        StatusConnected,
		LastCheck:     &now,
		LastConnected: &now,
	}
	s.active[t.ID] = t
	s.persist()
	s.mu.Unlock()

	vlog.Info("target connected", "id", t.ID, "url", t.URL)
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

	vlog.Info("target disconnected (saved)", "id", id, "url", t.URL)
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
	s.mu.RUnlock()

	if err := s.validatePprof(url); err != nil {
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

	vlog.Info("target reconnected", "id", id, "url", url)
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

	vlog.Info("target removed", "id", id)
	return nil
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
			vlog.Warn("failed to read connections file", "path", s.filePath, "error", err)
		}
		return
	}

	var targets []savedTarget
	if err := json.Unmarshal(data, &targets); err != nil {
		vlog.Warn("malformed connections file, starting empty", "path", s.filePath, "error", err)
		return
	}

	for _, st := range targets {
		lc := st.LastConnected
		s.saved[st.ID] = &Target{
			ID:            st.ID,
			URL:           st.URL,
			Label:         st.Label,
			Status:        StatusSaved,
			LastConnected: &lc,
		}
	}

	vlog.Info("loaded saved connections", "count", len(targets))
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
			ID:            t.ID,
			URL:           t.URL,
			Label:         t.Label,
			LastConnected: lc,
		})
	}
	for _, t := range s.saved {
		lc := time.Now()
		if t.LastConnected != nil {
			lc = *t.LastConnected
		}
		targets = append(targets, savedTarget{
			ID:            t.ID,
			URL:           t.URL,
			Label:         t.Label,
			LastConnected: lc,
		})
	}

	data, err := json.MarshalIndent(targets, "", "  ")
	if err != nil {
		vlog.Error("failed to marshal connections", "error", err)
		return
	}

	// Atomic write: write to temp file then rename
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		vlog.Error("failed to write connections file", "error", err)
		return
	}
	if err := os.Rename(tmp, s.filePath); err != nil {
		vlog.Error("failed to rename connections file", "error", err)
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
				s.mu.RUnlock()

				err := s.validatePprof(url)
				now := time.Now()

				s.mu.Lock()
				if t, ok := s.active[id]; ok {
					t.LastCheck = &now
					if err != nil {
						if t.Status != StatusUnreachable {
							vlog.Warn("target unreachable", "id", id, "url", url, "error", err)
						}
						t.Status = StatusUnreachable
					} else {
						if t.Status != StatusConnected {
							vlog.Info("target recovered", "id", id, "url", url)
						}
						t.Status = StatusConnected
					}
				}
				s.mu.Unlock()
			}
		}
	}
}
