package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// ServeState records the address of a running `tf9 serve` process so that a
// separate process (notably `tf9 mcp`) can reach its REST API. Only the PID is
// recorded in serve.pid; the listening port may differ from the requested one
// when freePort() bumps it, so the resolved baseURL is persisted here.
type ServeState struct {
	PID     int    `json:"pid"`
	Port    int    `json:"port"`
	BaseURL string `json:"baseURL"`
}

// ServeStatePath is the location of the serve.state file, alongside serve.pid.
func ServeStatePath() string {
	return filepath.Join(configDir(), "serve.state")
}

// WriteServeState persists the running server's address. Best-effort: returns
// an error the caller may log, but never panics.
func WriteServeState(s ServeState) error {
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	path := ServeStatePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// RemoveServeState deletes the serve.state file (on server shutdown).
func RemoveServeState() error {
	return os.Remove(ServeStatePath())
}

// ReadServeState loads the running server's address. A missing file yields a
// descriptive error so callers can surface "serve not running".
func ReadServeState() (ServeState, error) {
	data, err := os.ReadFile(ServeStatePath())
	if err != nil {
		return ServeState{}, err
	}
	var s ServeState
	if err := json.Unmarshal(data, &s); err != nil {
		return ServeState{}, fmt.Errorf("serve.state is corrupt: %w", err)
	}
	return s, nil
}
