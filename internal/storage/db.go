package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	vlog "github1.vg.vector.int/pes/vehub-vlog-go"
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

	vlog.Info("storage initialized", "dir", dataDir)
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
			file_path TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
		CREATE INDEX IF NOT EXISTS idx_profiles_timestamp ON profiles(timestamp DESC);
	`)
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

	_, err := s.db.Exec(
		`INSERT INTO profiles (id, target_url, type, timestamp, duration_sec, size, label, file_path)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		rec.ID, rec.TargetURL, rec.Type, rec.Timestamp, rec.DurationSec, rec.Size, rec.Label, rec.FilePath,
	)
	if err != nil {
		os.Remove(filePath)
		return fmt.Errorf("insert profile: %w", err)
	}

	return nil
}

func (s *Store) ListProfiles(profileType, targetURL string) ([]ProfileRecord, error) {
	query := `SELECT id, target_url, type, timestamp, duration_sec, size, label, file_path FROM profiles`
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
		if err := rows.Scan(&p.ID, &p.TargetURL, &p.Type, &p.Timestamp, &p.DurationSec, &p.Size, &p.Label, &p.FilePath); err != nil {
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
		`SELECT id, target_url, type, timestamp, duration_sec, size, label, file_path FROM profiles WHERE id = ?`,
		id,
	).Scan(&p.ID, &p.TargetURL, &p.Type, &p.Timestamp, &p.DurationSec, &p.Size, &p.Label, &p.FilePath)
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

func (s *Store) GetProfileData(id string) ([]byte, error) {
	p, err := s.GetProfile(id)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p.FilePath)
}

