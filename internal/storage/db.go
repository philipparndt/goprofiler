package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/philipparndt/go-logger"
	_ "modernc.org/sqlite"
)

type ProfileRecord struct {
	ID          string    `json:"id"`
	TargetURL   string    `json:"targetURL"`
	Type        string    `json:"type"`
	Timestamp   time.Time `json:"timestamp"`
	DurationSec int       `json:"durationSec,omitempty"`
	Size        int64     `json:"size"`
	Label       string    `json:"label,omitempty"`
	Tags        string    `json:"tags"`
	FilePath    string    `json:"-"`
}

type Store struct {
	db      *sql.DB
	dataDir string
}

func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	profilesDir := filepath.Join(dataDir, "profiles")
	if err := os.MkdirAll(profilesDir, 0755); err != nil {
		return nil, fmt.Errorf("create profiles dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "goprofiler.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	s := &Store{db: db, dataDir: dataDir}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	logger.Info("storage initialized", "dir", dataDir)
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY,
			target_url TEXT NOT NULL,
			type TEXT NOT NULL,
			timestamp DATETIME NOT NULL,
			duration_sec INTEGER DEFAULT 0,
			size INTEGER DEFAULT 0,
			label TEXT DEFAULT '',
			file_path TEXT NOT NULL,
			tags TEXT DEFAULT '[]'
		);
		CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
		CREATE INDEX IF NOT EXISTS idx_profiles_timestamp ON profiles(timestamp DESC);
	`)
	if err != nil {
		return err
	}
	// Migration: add tags column if missing (existing databases)
	s.db.Exec(`ALTER TABLE profiles ADD COLUMN tags TEXT DEFAULT '[]'`)
	return err
}

func (s *Store) ProfilesDir() string {
	return filepath.Join(s.dataDir, "profiles")
}

func (s *Store) SaveProfile(rec *ProfileRecord, data []byte) error {
	filePath := filepath.Join(s.ProfilesDir(), rec.ID+".pb.gz")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("write profile file: %w", err)
	}

	rec.FilePath = filePath
	rec.Size = int64(len(data))

	if rec.Tags == "" {
		rec.Tags = "[]"
	}
	_, err := s.db.Exec(
		`INSERT INTO profiles (id, target_url, type, timestamp, duration_sec, size, label, file_path, tags)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		rec.ID, rec.TargetURL, rec.Type, rec.Timestamp, rec.DurationSec, rec.Size, rec.Label, rec.FilePath, rec.Tags,
	)
	if err != nil {
		os.Remove(filePath)
		return fmt.Errorf("insert profile: %w", err)
	}

	return nil
}

func (s *Store) ListProfiles(profileType, targetURL, tag string) ([]ProfileRecord, error) {
	query := `SELECT id, target_url, type, timestamp, duration_sec, size, label, file_path, tags FROM profiles`
	args := []any{}
	conditions := []string{}

	if profileType != "" {
		conditions = append(conditions, "type = ?")
		args = append(args, profileType)
	}
	if targetURL != "" {
		conditions = append(conditions, "target_url = ?")
		args = append(args, targetURL)
	}
	if tag != "" {
		conditions = append(conditions, "tags LIKE ?")
		args = append(args, "%\""+tag+"\"%")
	}
	if len(conditions) > 0 {
		query += " WHERE " + conditions[0]
		for _, c := range conditions[1:] {
			query += " AND " + c
		}
	}
	query += " ORDER BY timestamp DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []ProfileRecord
	for rows.Next() {
		var p ProfileRecord
		if err := rows.Scan(&p.ID, &p.TargetURL, &p.Type, &p.Timestamp, &p.DurationSec, &p.Size, &p.Label, &p.FilePath, &p.Tags); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, rows.Err()
}

func (s *Store) ProfileCountsByTarget() (map[string]int, error) {
	rows, err := s.db.Query(`SELECT target_url, COUNT(*) FROM profiles GROUP BY target_url`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var url string
		var count int
		if err := rows.Scan(&url, &count); err != nil {
			return nil, err
		}
		counts[url] = count
	}
	return counts, rows.Err()
}

func (s *Store) GetProfile(id string) (*ProfileRecord, error) {
	var p ProfileRecord
	err := s.db.QueryRow(
		`SELECT id, target_url, type, timestamp, duration_sec, size, label, file_path, tags FROM profiles WHERE id = ?`,
		id,
	).Scan(&p.ID, &p.TargetURL, &p.Type, &p.Timestamp, &p.DurationSec, &p.Size, &p.Label, &p.FilePath, &p.Tags)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("profile not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) DeleteProfile(id string) error {
	p, err := s.GetProfile(id)
	if err != nil {
		return err
	}

	os.Remove(p.FilePath)

	_, err = s.db.Exec("DELETE FROM profiles WHERE id = ?", id)
	return err
}

func (s *Store) UpdateLabel(id, label string) error {
	result, err := s.db.Exec("UPDATE profiles SET label = ? WHERE id = ?", label, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("profile not found: %s", id)
	}
	return nil
}

func (s *Store) SetTags(id, tagsJSON string) error {
	result, err := s.db.Exec("UPDATE profiles SET tags = ? WHERE id = ?", tagsJSON, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("profile not found: %s", id)
	}
	return nil
}

func (s *Store) ListAllTags() ([]string, error) {
	rows, err := s.db.Query("SELECT DISTINCT tags FROM profiles WHERE tags != '[]'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tagSet := make(map[string]bool)
	for rows.Next() {
		var tagsJSON string
		if err := rows.Scan(&tagsJSON); err != nil {
			continue
		}
		// Parse JSON array
		var tags []string
		if err := json.Unmarshal([]byte(tagsJSON), &tags); err != nil {
			continue
		}
		for _, t := range tags {
			tagSet[t] = true
		}
	}

	var result []string
	for t := range tagSet {
		result = append(result, t)
	}
	sort.Strings(result)
	return result, nil
}

func (s *Store) RefreshProfile(id string, data []byte, timestamp time.Time) error {
	rec, err := s.GetProfile(id)
	if err != nil {
		return err
	}
	if err := os.WriteFile(rec.FilePath, data, 0644); err != nil {
		return fmt.Errorf("write profile file: %w", err)
	}
	_, err = s.db.Exec(
		`UPDATE profiles SET timestamp = ?, size = ? WHERE id = ?`,
		timestamp, int64(len(data)), id,
	)
	return err
}

func (s *Store) GetProfileData(id string) ([]byte, error) {
	p, err := s.GetProfile(id)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p.FilePath)
}

