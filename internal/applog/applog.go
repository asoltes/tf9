// Package applog configures the process-wide structured logger.
//
// Logs are written to both stderr (so they show in the terminal running
// `tf9 serve`) and a persistent file under the config dir so a hang or
// crash can be diagnosed after the fact. The level is read from config.yaml
// (log_level) and can be overridden by TF9_LOG_LEVEL; it is also adjustable
// at runtime via SetLevel without restarting the process.
package applog

import (
	"io"
	"log/slog"
	"os"
	"strings"

	"github.com/andres/tf9/internal/config"
)

// maxLogBytes caps the log file size. On Init, if the existing file exceeds
// this, it is truncated so the log can't grow unbounded. No rotation lib.
const maxLogBytes = 5 << 20 // 5 MB

// tailLimit caps how many log lines Tail returns to the web UI.
const tailLimit = 2000

// levelVar backs the active handler so SetLevel takes effect on a live logger.
var levelVar = new(slog.LevelVar)

// logPath is captured at Init so Tail can read the same file.
var logPath string

// Init sets up the default slog logger. It is safe to call once at startup
// (e.g. from server.Serve). If the log file can't be opened, logging falls
// back to stderr only.
func Init() {
	initWith(true)
}

// InitCLI sets up logging for CLI commands: file only, no stderr, so normal
// terminal output (terraform plan/apply, command results) stays clean.
func InitCLI() {
	initWith(false)
}

// initWith configures the default logger. When console is true, logs also go to
// stderr; the log file is always included when it can be opened.
func initWith(console bool) {
	levelVar.Set(resolveLevel())

	var writers []io.Writer
	if console {
		writers = append(writers, os.Stderr)
	}
	if f := openLogFile(); f != nil {
		writers = append(writers, f)
	}
	if len(writers) == 0 {
		// No file and no console — fall back to stderr so logs aren't lost.
		writers = append(writers, os.Stderr)
	}

	handler := slog.NewTextHandler(io.MultiWriter(writers...), &slog.HandlerOptions{
		Level: levelVar,
	})
	slog.SetDefault(slog.New(handler))
}

// resolveLevel picks the level: TF9_LOG_LEVEL env wins, then config.yaml's
// log_level, then INFO.
func resolveLevel() slog.Level {
	if env := os.Getenv("TF9_LOG_LEVEL"); strings.TrimSpace(env) != "" {
		if lvl, ok := parseLevel(env); ok {
			return lvl
		}
	}
	if cfg, err := config.Load(); err == nil {
		if lvl, ok := parseLevel(cfg.LogLevel); ok {
			return lvl
		}
	}
	return slog.LevelInfo
}

func parseLevel(name string) (slog.Level, bool) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "debug":
		return slog.LevelDebug, true
	case "info":
		return slog.LevelInfo, true
	case "warn", "warning":
		return slog.LevelWarn, true
	case "error":
		return slog.LevelError, true
	default:
		return slog.LevelInfo, false
	}
}

// SetLevel changes the active log level at runtime. Returns false for an
// unrecognized name.
func SetLevel(name string) bool {
	lvl, ok := parseLevel(name)
	if !ok {
		return false
	}
	levelVar.Set(lvl)
	slog.Info("log level changed", "level", LevelString())
	return true
}

// LevelString returns the current level as a lowercase string.
func LevelString() string {
	switch levelVar.Level() {
	case slog.LevelDebug:
		return "debug"
	case slog.LevelWarn:
		return "warn"
	case slog.LevelError:
		return "error"
	default:
		return "info"
	}
}

// Tail returns the last n lines of the log file (capped at tailLimit). It reads
// the whole file, which is safe given the maxLogBytes cap.
func Tail(n int) []string {
	if logPath == "" {
		logPath = config.LogFile()
	}
	if n <= 0 || n > tailLimit {
		n = tailLimit
	}
	data, err := os.ReadFile(logPath)
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return nil
	}
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return lines
}

// openLogFile opens (and truncates if oversized) the app log file. Returns nil
// on any error so callers degrade to stderr-only logging.
func openLogFile() *os.File {
	logPath = config.LogFile()
	if logPath == "" {
		return nil
	}
	flags := os.O_CREATE | os.O_WRONLY | os.O_APPEND
	if info, err := os.Stat(logPath); err == nil && info.Size() > maxLogBytes {
		flags = os.O_CREATE | os.O_WRONLY | os.O_TRUNC
	}
	f, err := os.OpenFile(logPath, flags, 0o644)
	if err != nil {
		return nil
	}
	return f
}
