package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/philipparndt/go-logger"
)

type Settings struct {
	AIProvider     string `json:"aiProvider"`               // "claude" or "gh-copilot"
	AIModel        string `json:"aiModel,omitempty"`        // e.g. "sonnet", "opus", "haiku" — empty = CLI default
	KubeconfigPath string `json:"kubeconfigPath,omitempty"` // optional custom kubeconfig path
}

type Store struct {
	mu       sync.RWMutex
	settings Settings
	filePath string
}

func NewStore(configDir string) (*Store, error) {
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return nil, err
	}

	s := &Store{
		settings: Settings{AIProvider: "claude"},
		filePath: filepath.Join(configDir, "settings.json"),
	}
	s.load()
	return s, nil
}

func (s *Store) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *Store) Update(settings Settings) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
	s.persist()
}

func (s *Store) load() {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return
	}
	if err := json.Unmarshal(data, &s.settings); err != nil {
		logger.Warn("malformed settings file", "error", err)
	}
}

func (s *Store) persist() {
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		return
	}
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return
	}
	os.Rename(tmp, s.filePath)
}
