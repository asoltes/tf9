package config

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

const currentVersion = 1

const (
	DefaultApprovalTimeoutSeconds     = 300
	DefaultReviewedPlanTimeoutSeconds = 3600
)

var (
	ErrRevisionConflict = errors.New("config changed since it was loaded")
	pathOverride        string
	pathMu              sync.RWMutex
	storeMu             sync.Mutex
	accountIDRE         = regexp.MustCompile(`^\d{12}$`)
)

// ProfileMapping maps an exact directory base name to an AWS CLI profile.
// Slice order determines execution order for --recursive runs.
type ProfileMapping struct {
	Dir     string `yaml:"dir" json:"dir"`
	Profile string `yaml:"profile" json:"profile"`
}

// ProfileMappings is an ordered slice of ProfileMapping with a custom YAML
// unmarshaler that silently migrates the legacy map format (dir: profile) to
// the current list format ([{dir: ..., profile: ...}]).
type ProfileMappings []ProfileMapping

func (p *ProfileMappings) UnmarshalYAML(value *yaml.Node) error {
	switch value.Kind {
	case yaml.SequenceNode: // current list format
		var seq []ProfileMapping
		if err := value.Decode(&seq); err != nil {
			return err
		}
		*p = seq
	case yaml.MappingNode: // legacy map format — auto-migrate
		m := map[string]string{}
		if err := value.Decode(&m); err != nil {
			return err
		}
		out := make(ProfileMappings, 0, len(m))
		for dir, profile := range m {
			out = append(out, ProfileMapping{Dir: dir, Profile: profile})
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Dir < out[j].Dir })
		*p = out
	default:
		*p = nil
	}
	return nil
}

type Config struct {
	Version         int             `yaml:"version" json:"version"`
	Repositories    []Repository    `yaml:"repositories" json:"repositories"`
	ProfileMappings ProfileMappings `yaml:"profile_mappings,omitempty" json:"profile_mappings,omitempty"`
	StsProfile      string          `yaml:"sts_profile,omitempty" json:"sts_profile,omitempty"`
	Web             WebConfig       `yaml:"web,omitempty" json:"web,omitempty"`
	// LogLevel sets the application log verbosity: debug, info, warn, or error.
	// Empty means info. The TF9_LOG_LEVEL env var overrides this when set.
	LogLevel string `yaml:"log_level,omitempty" json:"log_level,omitempty"`
}

type WebConfig struct {
	SavedPlanApply             bool `yaml:"saved_plan_apply,omitempty" json:"saved_plan_apply,omitempty"`
	ApprovalTimeoutSeconds     int  `yaml:"approval_timeout_seconds,omitempty" json:"approval_timeout_seconds,omitempty"`
	ReviewedPlanTimeoutSeconds int  `yaml:"reviewed_plan_timeout_seconds,omitempty" json:"reviewed_plan_timeout_seconds,omitempty"`
}

func (w WebConfig) ApprovalTimeout() time.Duration {
	seconds := w.ApprovalTimeoutSeconds
	if seconds == 0 {
		seconds = DefaultApprovalTimeoutSeconds
	}
	return time.Duration(seconds) * time.Second
}

func (w WebConfig) ReviewedPlanTimeout() time.Duration {
	seconds := w.ReviewedPlanTimeoutSeconds
	if seconds == 0 {
		seconds = DefaultReviewedPlanTimeoutSeconds
	}
	return time.Duration(seconds) * time.Second
}

type Repository struct {
	Name              string `yaml:"name" json:"name"`
	Path              string `yaml:"path" json:"path"`
	DefaultAWSProfile string `yaml:"default_aws_profile,omitempty" json:"default_aws_profile,omitempty"`
	DefaultAccountID  string `yaml:"default_account_id,omitempty" json:"default_account_id,omitempty"`
	DefaultRegion     string `yaml:"default_region,omitempty" json:"default_region,omitempty"`
	// IntegrationBranch is the branch that mirrors what is deployed; feature
	// branches reconcile against origin/<IntegrationBranch> before apply.
	IntegrationBranch string `yaml:"integration_branch,omitempty" json:"integration_branch,omitempty"`
	// ActiveBranchWindowDays bounds how recently a branch must have been
	// committed to count as "active/open" for AI auto-mode drift reconciliation.
	ActiveBranchWindowDays int `yaml:"active_branch_window_days,omitempty" json:"active_branch_window_days,omitempty"`
	// ActiveBranchLimit caps how many active branches are fed to the AI.
	ActiveBranchLimit int          `yaml:"active_branch_limit,omitempty" json:"active_branch_limit,omitempty"`
	Targets           []RepoTarget `yaml:"targets,omitempty" json:"targets"`
	Disabled          bool         `yaml:"disabled,omitempty" json:"disabled,omitempty"`
}

// Defaults for branch-reconciliation settings, applied when the config value is
// unset (zero) so a blank field falls back to a sensible value rather than 0.
const (
	DefaultIntegrationBranch      = "main"
	DefaultActiveBranchWindowDays = 30
	DefaultActiveBranchLimit      = 20
)

// IntegrationBranchOrDefault returns the configured integration branch or the
// default ("main") when unset.
func (r Repository) IntegrationBranchOrDefault() string {
	if strings.TrimSpace(r.IntegrationBranch) == "" {
		return DefaultIntegrationBranch
	}
	return r.IntegrationBranch
}

// ActiveWindowDays returns the configured active-branch window in days, or the
// default when unset/non-positive.
func (r Repository) ActiveWindowDays() int {
	if r.ActiveBranchWindowDays <= 0 {
		return DefaultActiveBranchWindowDays
	}
	return r.ActiveBranchWindowDays
}

// ActiveLimit returns the configured active-branch cap, or the default when
// unset/non-positive.
func (r Repository) ActiveLimit() int {
	if r.ActiveBranchLimit <= 0 {
		return DefaultActiveBranchLimit
	}
	return r.ActiveBranchLimit
}

// RepoTarget maps a Terraform directory relative to its repository root.
type RepoTarget struct {
	Name       string `yaml:"name" json:"name"`
	Directory  string `yaml:"directory" json:"directory"`
	AWSProfile string `yaml:"aws_profile" json:"aws_profile"`
	AccountID  string `yaml:"account_id,omitempty" json:"account_id,omitempty"`
	Region     string `yaml:"region,omitempty" json:"region,omitempty"`
	Disabled   bool   `yaml:"disabled,omitempty" json:"disabled,omitempty"`
	Group      string `yaml:"group,omitempty" json:"group,omitempty"`
}

// RepoConfig preserves the existing API envelope while groups are removed.
type RepoConfig struct {
	DefaultAWSProfile      string       `json:"default_aws_profile,omitempty"`
	DefaultAccountID       string       `json:"default_account_id,omitempty"`
	DefaultRegion          string       `json:"default_region,omitempty"`
	IntegrationBranch      string       `json:"integration_branch,omitempty"`
	ActiveBranchWindowDays int          `json:"active_branch_window_days,omitempty"`
	ActiveBranchLimit      int          `json:"active_branch_limit,omitempty"`
	Targets                []RepoTarget `json:"targets"`
}

// SetPath overrides the configuration path for the current process.
func SetPath(path string) {
	pathMu.Lock()
	pathOverride = path
	pathMu.Unlock()
}

func ConfigPath() string {
	pathMu.RLock()
	override := pathOverride
	pathMu.RUnlock()
	if override != "" {
		return expandHome(override)
	}
	if env := os.Getenv("TF9_CONFIG"); env != "" {
		return expandHome(env)
	}
	return filepath.Join(configDir(), "config.yaml")
}

func configDir() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "tf9")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "tf9")
}

func runtimeDir() string {
	if path := ConfigPath(); path != "" {
		return filepath.Dir(path)
	}
	return configDir()
}

func expandHome(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			if path == "~" {
				return home
			}
			return filepath.Join(home, path[2:])
		}
	}
	return path
}

func DefaultReportDir() string {
	dir := filepath.Join(runtimeDir(), "reports")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Warn("could not create report dir", "dir", dir, "err", err)
	}
	return dir
}

// CostScanDir returns the directory holding saved Infracost breakdown scans.
func CostScanDir() string {
	dir := filepath.Join(runtimeDir(), "cost-scans")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Warn("could not create cost scan dir", "dir", dir, "err", err)
	}
	return dir
}

// SavedPlanDir returns the private directory used by the web UI to retain
// reviewed Terraform plan files between the plan and apply runs.
func SavedPlanDir() string {
	dir := filepath.Join(runtimeDir(), "plans")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		slog.Warn("could not create saved plan dir", "dir", dir, "err", err)
	}
	return dir
}

func RunsFile() string {
	if err := os.MkdirAll(runtimeDir(), 0o755); err == nil {
		return filepath.Join(runtimeDir(), "runs.json")
	} else {
		slog.Warn("could not create config dir, using temp for runs file", "dir", runtimeDir(), "err", err)
	}
	return filepath.Join(os.TempDir(), "tf9-runs.json")
}

// LogFile returns the path to the application log file. Falls back to a temp
// path if the config dir cannot be created.
func LogFile() string {
	if err := os.MkdirAll(runtimeDir(), 0o755); err == nil {
		return filepath.Join(runtimeDir(), "tf9.log")
	} else {
		slog.Warn("could not create config dir, using temp for log file", "dir", runtimeDir(), "err", err)
	}
	return filepath.Join(os.TempDir(), "tf9.log")
}

func Load() (Config, error) {
	storeMu.Lock()
	defer storeMu.Unlock()
	return loadLocked(true)
}

// InfracostConfig holds Infracost cost-estimation settings. It is persisted to a
// separate file (infracost.yaml) so the API key never round-trips through the
// committed config.yaml / the raw YAML editor.
type InfracostConfig struct {
	APIKey           string `yaml:"api_key,omitempty"`
	EnabledByDefault bool   `yaml:"enabled_by_default"`
	Currency         string `yaml:"currency,omitempty"`
}

// InfracostPath returns the path to the Infracost settings file.
func InfracostPath() string {
	return filepath.Join(runtimeDir(), "infracost.yaml")
}

// LoadInfracost reads the Infracost settings. A missing file yields defaults.
// The INFRACOST_API_KEY environment variable overrides the stored key.
func LoadInfracost() (InfracostConfig, error) {
	cfg := InfracostConfig{Currency: "USD"}
	data, err := os.ReadFile(InfracostPath())
	if errors.Is(err, os.ErrNotExist) {
		// fall through to env override / defaults
	} else if err != nil {
		return cfg, fmt.Errorf("read infracost config %s: %w", InfracostPath(), err)
	} else if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse infracost config %s: %w", InfracostPath(), err)
	}
	if env := strings.TrimSpace(os.Getenv("INFRACOST_API_KEY")); env != "" {
		cfg.APIKey = env
	}
	if strings.TrimSpace(cfg.Currency) == "" {
		cfg.Currency = "USD"
	}
	return cfg, nil
}

// SaveInfracost persists the Infracost settings with 0600 perms (it holds a
// secret API key). An empty APIKey is preserved as-is so callers can clear it.
func SaveInfracost(cfg InfracostConfig) error {
	cfg.APIKey = strings.TrimSpace(cfg.APIKey)
	cfg.Currency = strings.TrimSpace(cfg.Currency)
	if cfg.Currency == "" {
		cfg.Currency = "USD"
	}
	if err := os.MkdirAll(runtimeDir(), 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal infracost config: %w", err)
	}
	if err := os.WriteFile(InfracostPath(), data, 0o600); err != nil {
		return fmt.Errorf("write infracost config %s: %w", InfracostPath(), err)
	}
	// Enforce 0600 even if the file already existed with looser perms — it holds
	// the API key secret.
	if err := os.Chmod(InfracostPath(), 0o600); err != nil {
		slog.Warn("could not tighten infracost config perms", "path", InfracostPath(), "err", err)
	}
	return nil
}

// ReadRaw returns the config source and a revision used for optimistic locking.
func ReadRaw() (path, content, revision string, err error) {
	storeMu.Lock()
	defer storeMu.Unlock()
	if _, err = loadLocked(true); err != nil {
		return "", "", "", err
	}
	path = ConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", "", fmt.Errorf("read config %s: %w", path, err)
	}
	return path, string(data), revisionFor(data), nil
}

// FormatRaw parses YAML and returns a consistently indented document without
// writing it. yaml.Node preserves mapping order and comments.
func FormatRaw(content string) (string, error) {
	var document yaml.Node
	decoder := yaml.NewDecoder(strings.NewReader(content))
	if err := decoder.Decode(&document); err != nil {
		return "", fmt.Errorf("parse YAML: %w", err)
	}
	if len(document.Content) == 0 {
		return "", fmt.Errorf("parse YAML: document is empty")
	}

	var formatted bytes.Buffer
	encoder := yaml.NewEncoder(&formatted)
	encoder.SetIndent(2)
	if err := encoder.Encode(&document); err != nil {
		return "", fmt.Errorf("format YAML: %w", err)
	}
	if err := encoder.Close(); err != nil {
		return "", fmt.Errorf("finish formatting YAML: %w", err)
	}
	return formatted.String(), nil
}

// WriteRaw validates and atomically saves YAML without reformatting it.
func WriteRaw(content, expectedRevision string) (string, error) {
	storeMu.Lock()
	defer storeMu.Unlock()
	returnRevision := ""
	err := withFileLock(func() error {
		path := ConfigPath()
		current, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			current = nil
		} else if err != nil {
			return fmt.Errorf("read config %s: %w", path, err)
		}
		if expectedRevision != revisionFor(current) {
			return ErrRevisionConflict
		}
		data := []byte(content)
		var cfg Config
		decoder := yaml.NewDecoder(bytes.NewReader(data))
		decoder.KnownFields(true)
		if err := decoder.Decode(&cfg); err != nil {
			return fmt.Errorf("parse config: %w", err)
		}
		if err := validate(&cfg); err != nil {
			return fmt.Errorf("invalid config: %w", err)
		}
		if len(data) == 0 || data[len(data)-1] != '\n' {
			data = append(data, '\n')
		}
		if err := writeRawLocked(data); err != nil {
			return err
		}
		returnRevision = revisionFor(data)
		return nil
	})
	return returnRevision, err
}

func Save(cfg Config) error {
	storeMu.Lock()
	defer storeMu.Unlock()
	return withFileLock(func() error {
		if err := validate(&cfg); err != nil {
			return err
		}
		return writeLocked(cfg)
	})
}

// SetLogLevel persists the log level into config.yaml, leaving the rest of the
// configuration untouched.
func SetLogLevel(level string) error {
	storeMu.Lock()
	defer storeMu.Unlock()
	return withFileLock(func() error {
		cfg, err := loadLocked(true)
		if err != nil {
			return err
		}
		cfg.LogLevel = level
		if err := validate(&cfg); err != nil {
			return err
		}
		return writeLocked(cfg)
	})
}

func Update(fn func(*Config) error) error {
	storeMu.Lock()
	defer storeMu.Unlock()
	return withFileLock(func() error {
		cfg, err := loadLocked(true)
		if err != nil {
			return err
		}
		if err := fn(&cfg); err != nil {
			return err
		}
		if err := validate(&cfg); err != nil {
			return err
		}
		return writeLocked(cfg)
	})
}

func loadLocked(create bool) (Config, error) {
	path := ConfigPath()
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if migrated, migrateErr := migrateLegacyLocked(); migrateErr != nil {
			return Config{}, migrateErr
		} else if migrated {
			data, err = os.ReadFile(path)
		} else if create {
			cfg := Config{Version: currentVersion, Repositories: []Repository{}}
			if err := writeLocked(cfg); err != nil {
				return Config{}, err
			}
			return cfg, nil
		}
	}
	if err != nil {
		return Config{}, fmt.Errorf("read config %s: %w", path, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config %s: %w", path, err)
	}
	if err := validate(&cfg); err != nil {
		return Config{}, fmt.Errorf("invalid config %s: %w", path, err)
	}
	return cfg, nil
}

func validate(cfg *Config) error {
	if cfg.Version == 0 {
		cfg.Version = currentVersion
	}
	if cfg.Version != currentVersion {
		return fmt.Errorf("unsupported version %d (expected %d)", cfg.Version, currentVersion)
	}
	cfg.LogLevel = strings.ToLower(strings.TrimSpace(cfg.LogLevel))
	switch cfg.LogLevel {
	case "", "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("invalid log_level %q (expected debug, info, warn, or error)", cfg.LogLevel)
	}
	if cfg.Web.ApprovalTimeoutSeconds < 0 {
		return fmt.Errorf("web.approval_timeout_seconds must be zero or greater")
	}
	if cfg.Web.ReviewedPlanTimeoutSeconds < 0 {
		return fmt.Errorf("web.reviewed_plan_timeout_seconds must be zero or greater")
	}
	repoNames := map[string]bool{}
	for ri := range cfg.Repositories {
		repo := &cfg.Repositories[ri]
		repo.Name = strings.TrimSpace(repo.Name)
		repo.Path = expandHome(strings.TrimSpace(repo.Path))
		if repo.Name == "" || repo.Path == "" {
			return fmt.Errorf("repository name and path are required")
		}
		if strings.ContainsAny(repo.Name, "/\\\n\r\t") {
			return fmt.Errorf("repository name %q must not contain path separators or control characters", repo.Name)
		}
		if !filepath.IsAbs(repo.Path) {
			return fmt.Errorf("repository %q path must be absolute", repo.Name)
		}
		if repoNames[repo.Name] {
			return fmt.Errorf("duplicate repository %q", repo.Name)
		}
		repoNames[repo.Name] = true
		repo.DefaultAWSProfile = strings.TrimSpace(repo.DefaultAWSProfile)
		repo.DefaultAccountID = strings.TrimSpace(repo.DefaultAccountID)
		repo.DefaultRegion = strings.TrimSpace(repo.DefaultRegion)
		if repo.DefaultAccountID != "" && !accountIDRE.MatchString(repo.DefaultAccountID) {
			return fmt.Errorf("repository %q default_account_id must be 12 digits", repo.Name)
		}

		targetNames := map[string]bool{}
		targetDirs := map[string]bool{}
		for ti := range repo.Targets {
			target := &repo.Targets[ti]
			target.Name = strings.TrimSpace(target.Name)
			target.Directory = filepath.Clean(strings.TrimSpace(target.Directory))
			target.AWSProfile = strings.TrimSpace(target.AWSProfile)
			target.AccountID = strings.TrimSpace(target.AccountID)
			target.Region = strings.TrimSpace(target.Region)
			target.Group = strings.TrimSpace(target.Group)
			if target.Name == "" || target.Directory == "" || target.AWSProfile == "" {
				return fmt.Errorf("repository %q targets require name, directory, and aws_profile", repo.Name)
			}
			if filepath.IsAbs(target.Directory) || target.Directory == "." || strings.HasPrefix(target.Directory, "..") {
				return fmt.Errorf("repository %q target %q has invalid directory", repo.Name, target.Name)
			}
			if target.AccountID != "" && !accountIDRE.MatchString(target.AccountID) {
				return fmt.Errorf("repository %q target %q account_id must be 12 digits", repo.Name, target.Name)
			}
			if targetNames[target.Name] {
				return fmt.Errorf("repository %q has duplicate target name %q", repo.Name, target.Name)
			}
			if targetDirs[target.Directory] {
				return fmt.Errorf("repository %q has duplicate target directory %q", repo.Name, target.Directory)
			}
			targetNames[target.Name] = true
			targetDirs[target.Directory] = true
		}
	}
	if cfg.Repositories == nil {
		cfg.Repositories = []Repository{}
	}
	return nil
}

func writeLocked(cfg Config) error {
	if err := validate(&cfg); err != nil {
		return err
	}
	path := ConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return writeRawLocked(data)
}

func writeRawLocked(data []byte) error {
	path := ConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".config-*.yaml")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func revisionFor(data []byte) string {
	sum := sha256.Sum256(data)
	return fmt.Sprintf("%x", sum)
}

func withFileLock(fn func() error) error {
	lockDir := ConfigPath() + ".lock"
	if err := os.MkdirAll(filepath.Dir(lockDir), 0o700); err != nil {
		return err
	}
	for attempt := 0; ; attempt++ {
		err := os.Mkdir(lockDir, 0o700)
		if err == nil {
			break
		}
		if !errors.Is(err, os.ErrExist) {
			return err
		}
		if info, statErr := os.Stat(lockDir); statErr == nil && time.Since(info.ModTime()) > 30*time.Second {
			slog.Warn("removing stale config lock", "lock", lockDir, "age", time.Since(info.ModTime()))
			if rmErr := os.RemoveAll(lockDir); rmErr != nil {
				slog.Warn("could not remove stale config lock", "lock", lockDir, "err", rmErr)
			}
			continue
		}
		if attempt >= 100 {
			return fmt.Errorf("timed out waiting for config lock %s", lockDir)
		}
		time.Sleep(50 * time.Millisecond)
	}
	defer os.Remove(lockDir)
	return fn()
}

func FindRepository(name string) (Repository, bool, error) {
	cfg, err := Load()
	if err != nil {
		return Repository{}, false, err
	}
	for _, repo := range cfg.Repositories {
		if repo.Name == name {
			return repo, true, nil
		}
	}
	return Repository{}, false, nil
}

func AddRepo(name, path string) error {
	return Update(func(cfg *Config) error {
		for _, repo := range cfg.Repositories {
			if repo.Name == name {
				return fmt.Errorf("repo %q already registered at %s", name, repo.Path)
			}
		}
		cfg.Repositories = append(cfg.Repositories, Repository{Name: name, Path: path, Targets: []RepoTarget{}})
		return nil
	})
}

func RemoveRepo(name string) error {
	return Update(func(cfg *Config) error {
		for i, repo := range cfg.Repositories {
			if repo.Name == name {
				cfg.Repositories = append(cfg.Repositories[:i], cfg.Repositories[i+1:]...)
				return nil
			}
		}
		return fmt.Errorf("repo %q not found", name)
	})
}

func RenameRepo(oldName, newName string) error {
	return Update(func(cfg *Config) error {
		newName = strings.TrimSpace(newName)
		if newName == "" {
			return fmt.Errorf("new name must not be empty")
		}
		idx := -1
		for i, repo := range cfg.Repositories {
			if repo.Name == oldName {
				idx = i
			} else if repo.Name == newName {
				return fmt.Errorf("repo %q already exists", newName)
			}
		}
		if idx == -1 {
			return fmt.Errorf("repo %q not found", oldName)
		}
		cfg.Repositories[idx].Name = newName
		return nil
	})
}

func SetRepoDisabled(name string, disabled bool) error {
	return Update(func(cfg *Config) error {
		for i, repo := range cfg.Repositories {
			if repo.Name == name {
				cfg.Repositories[i].Disabled = disabled
				return nil
			}
		}
		return fmt.Errorf("repo %q not found", name)
	})
}

func SaveRepoConfig(name string, repoCfg RepoConfig) error {
	return Update(func(cfg *Config) error {
		for i := range cfg.Repositories {
			if cfg.Repositories[i].Name == name {
				cfg.Repositories[i].DefaultAWSProfile = repoCfg.DefaultAWSProfile
				cfg.Repositories[i].DefaultAccountID = repoCfg.DefaultAccountID
				cfg.Repositories[i].DefaultRegion = repoCfg.DefaultRegion
				cfg.Repositories[i].IntegrationBranch = repoCfg.IntegrationBranch
				cfg.Repositories[i].ActiveBranchWindowDays = repoCfg.ActiveBranchWindowDays
				cfg.Repositories[i].ActiveBranchLimit = repoCfg.ActiveBranchLimit
				cfg.Repositories[i].Targets = repoCfg.Targets
				return nil
			}
		}
		return fmt.Errorf("repo %q not found", name)
	})
}

func LoadRepoConfig(name string) (RepoConfig, error) {
	repo, ok, err := FindRepository(name)
	if err != nil {
		return RepoConfig{}, err
	}
	if !ok {
		return RepoConfig{}, fmt.Errorf("repo %q not found", name)
	}
	return RepoConfig{
		DefaultAWSProfile:      repo.DefaultAWSProfile,
		DefaultAccountID:       repo.DefaultAccountID,
		DefaultRegion:          repo.DefaultRegion,
		IntegrationBranch:      repo.IntegrationBranch,
		ActiveBranchWindowDays: repo.ActiveBranchWindowDays,
		ActiveBranchLimit:      repo.ActiveBranchLimit,
		Targets:                repo.Targets,
	}, nil
}

func AddTarget(repoName string, target RepoTarget, after string) error {
	return Update(func(cfg *Config) error {
		for ri := range cfg.Repositories {
			repo := &cfg.Repositories[ri]
			if repo.Name != repoName {
				continue
			}
			for _, existing := range repo.Targets {
				if existing.Name == target.Name {
					return fmt.Errorf("target %q already exists", target.Name)
				}
			}
			if after == "" {
				repo.Targets = append(repo.Targets, target)
				return nil
			}
			for i, existing := range repo.Targets {
				if existing.Name == after {
					repo.Targets = append(repo.Targets[:i+1], append([]RepoTarget{target}, repo.Targets[i+1:]...)...)
					return nil
				}
			}
			return fmt.Errorf("target %q not found", after)
		}
		return fmt.Errorf("repo %q not found", repoName)
	})
}

func RemoveTarget(repoName, targetName string) error {
	return Update(func(cfg *Config) error {
		for ri := range cfg.Repositories {
			repo := &cfg.Repositories[ri]
			if repo.Name != repoName {
				continue
			}
			for i, target := range repo.Targets {
				if target.Name == targetName {
					repo.Targets = append(repo.Targets[:i], repo.Targets[i+1:]...)
					return nil
				}
			}
			return fmt.Errorf("target %q not found", targetName)
		}
		return fmt.Errorf("repo %q not found", repoName)
	})
}

func MoveTarget(repoName, targetName, after string) error {
	return Update(func(cfg *Config) error {
		for ri := range cfg.Repositories {
			repo := &cfg.Repositories[ri]
			if repo.Name != repoName {
				continue
			}
			var moving RepoTarget
			found := false
			remaining := make([]RepoTarget, 0, len(repo.Targets))
			for _, target := range repo.Targets {
				if target.Name == targetName {
					moving = target
					found = true
				} else {
					remaining = append(remaining, target)
				}
			}
			if !found {
				return fmt.Errorf("target %q not found", targetName)
			}
			if after == "" {
				repo.Targets = append([]RepoTarget{moving}, remaining...)
				return nil
			}
			for i, target := range remaining {
				if target.Name == after {
					repo.Targets = append(remaining[:i+1], append([]RepoTarget{moving}, remaining[i+1:]...)...)
					return nil
				}
			}
			return fmt.Errorf("target %q not found", after)
		}
		return fmt.Errorf("repo %q not found", repoName)
	})
}

// LoadRepos is retained as an internal adapter while callers migrate to Config.
func LoadRepos() (map[string]string, error) {
	cfg, err := Load()
	if err != nil {
		return nil, err
	}
	repos := make(map[string]string, len(cfg.Repositories))
	for _, repo := range cfg.Repositories {
		repos[repo.Name] = repo.Path
	}
	return repos, nil
}

type legacyTarget struct {
	Dir      string `json:"dir"`
	Name     string `json:"name"`
	Profile  string `json:"profile"`
	Group    string `json:"group"`
	Disabled bool   `json:"disabled"`
}

type legacyGroup struct {
	Name     string `json:"name"`
	Disabled bool   `json:"disabled"`
}

type legacyRepoConfig struct {
	Targets []legacyTarget `json:"targets"`
	Groups  []legacyGroup  `json:"groups"`
}

func migrateLegacyLocked() (bool, error) {
	dir := filepath.Dir(ConfigPath())
	envPath := filepath.Join(dir, "envs")
	reposPath := filepath.Join(dir, "repos")
	repoConfigsDir := filepath.Join(dir, "repo-configs")
	if !exists(envPath) && !exists(reposPath) && !exists(repoConfigsDir) {
		return false, nil
	}

	envs, err := readLegacyPairs(envPath)
	if err != nil {
		return false, err
	}
	repos, err := readLegacyPairs(reposPath)
	if err != nil {
		return false, err
	}
	cfg := Config{Version: currentVersion, Repositories: []Repository{}}
	for _, pair := range repos {
		repo := Repository{Name: pair[0], Path: pair[1], Targets: []RepoTarget{}}
		legacyPath := filepath.Join(repoConfigsDir, repo.Name+".json")
		var legacy legacyRepoConfig
		if data, readErr := os.ReadFile(legacyPath); readErr == nil {
			if err := json.Unmarshal(data, &legacy); err != nil {
				return false, fmt.Errorf("parse legacy repo config %s: %w", legacyPath, err)
			}
		}
		disabledGroups := map[string]bool{}
		profileByEnv := map[string]string{}
		for _, env := range envs {
			profileByEnv[env[0]] = env[1]
		}
		for _, group := range legacy.Groups {
			disabledGroups[group.Name] = group.Disabled
		}
		if len(legacy.Targets) > 0 {
			for _, target := range legacy.Targets {
				name := target.Name
				if name == "" {
					name = filepath.Base(target.Dir)
				}
				profile := target.Profile
				if profile == "" {
					profile = profileByEnv[name]
				}
				repo.Targets = append(repo.Targets, RepoTarget{
					Name:       name,
					Directory:  target.Dir,
					AWSProfile: profile,
					Disabled:   target.Disabled || disabledGroups[target.Group],
				})
			}
		} else {
			for _, env := range envs {
				repo.Targets = append(repo.Targets, RepoTarget{
					Name:       env[0],
					Directory:  filepath.Join("environments", env[0]),
					AWSProfile: env[1],
				})
			}
		}
		cfg.Repositories = append(cfg.Repositories, repo)
	}
	if err := writeLocked(cfg); err != nil {
		return false, err
	}
	if _, err := loadLocked(false); err != nil {
		return false, fmt.Errorf("verify migrated config: %w", err)
	}

	backup := filepath.Join(dir, "legacy-backup-"+time.Now().UTC().Format("20060102-150405"))
	if err := os.MkdirAll(backup, 0o700); err != nil {
		return false, err
	}
	for _, old := range []string{envPath, reposPath, repoConfigsDir} {
		if exists(old) {
			if err := os.Rename(old, filepath.Join(backup, filepath.Base(old))); err != nil {
				return false, err
			}
		}
	}
	return true, nil
}

func readLegacyPairs(path string) ([][2]string, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var pairs [][2]string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return nil, fmt.Errorf("malformed legacy entry %q", line)
		}
		pairs = append(pairs, [2]string{parts[0], parts[1]})
	}
	return pairs, scanner.Err()
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
