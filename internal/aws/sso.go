package aws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const identityCacheTTL = 5 * time.Minute

type cachedIdentity struct {
	id       Identity
	cachedAt time.Time
}

var (
	identityCache   = map[string]cachedIdentity{}
	identityCacheMu sync.Mutex
)

// InvalidateIdentityCache removes the cached identity for profile so the next
// GetIdentity call hits STS. Call after SSO login or logout.
func InvalidateIdentityCache(profile string) {
	identityCacheMu.Lock()
	delete(identityCache, profile)
	identityCacheMu.Unlock()
}

// identityTimeout bounds a single `aws sts get-caller-identity` call so a
// stalled SSO refresh can't hang the request indefinitely.
const identityTimeout = 10 * time.Second

// Identity holds the parsed fields from `aws sts get-caller-identity`.
// JSON tags use lowerCamel for the API output shape.
type Identity struct {
	Account string `json:"account"`
	Arn     string `json:"arn"`
	UserID  string `json:"userId"`
}

// awsIdentityResponse matches the PascalCase output of the AWS CLI.
type awsIdentityResponse struct {
	Account string `json:"Account"`
	Arn     string `json:"Arn"`
	UserID  string `json:"UserId"`
}

// GetIdentity calls `aws sts get-caller-identity` and returns the parsed result.
// When profile is non-empty, AWS_PROFILE is set on the subprocess; otherwise the
// default credential chain is used.
//
// ctx bounds the subprocess (cancelled when the HTTP client disconnects); an
// additional identityTimeout cap guarantees the call returns even if the AWS
// CLI stalls on an expired SSO session — the bug this guards against.
func GetIdentity(ctx context.Context, profile string) (Identity, error) {
	identityCacheMu.Lock()
	if c, ok := identityCache[profile]; ok && time.Since(c.cachedAt) < identityCacheTTL {
		identityCacheMu.Unlock()
		slog.Debug("sts get-caller-identity cache hit", "profile", profile)
		return c.id, nil
	}
	identityCacheMu.Unlock()

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, identityTimeout)
	defer cancel()

	start := time.Now()
	cmd := exec.CommandContext(ctx, "aws", "sts", "get-caller-identity", "--output", "json")
	env := os.Environ()
	if profile != "" {
		env = append(env, "AWS_PROFILE="+profile)
	}
	cmd.Env = env
	out, err := cmd.Output()
	elapsed := time.Since(start)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			slog.Warn("sts get-caller-identity timed out", "profile", profile, "elapsed", elapsed, "timeout", identityTimeout)
			return Identity{}, fmt.Errorf("aws sts get-caller-identity timed out after %s (session may be expired)", identityTimeout)
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && len(exitErr.Stderr) > 0 {
			slog.Warn("sts get-caller-identity failed", "profile", profile, "elapsed", elapsed, "err", strings.TrimSpace(string(exitErr.Stderr)))
			return Identity{}, fmt.Errorf("%w: %s", err, strings.TrimSpace(string(exitErr.Stderr)))
		}
		slog.Warn("sts get-caller-identity failed", "profile", profile, "elapsed", elapsed, "err", err)
		return Identity{}, err
	}
	slog.Debug("sts get-caller-identity ok", "profile", profile, "elapsed", elapsed)
	id, err := parseIdentity(out)
	if err != nil {
		return Identity{}, err
	}
	identityCacheMu.Lock()
	identityCache[profile] = cachedIdentity{id: id, cachedAt: time.Now()}
	identityCacheMu.Unlock()
	return id, nil
}

// parseIdentity unmarshals the raw AWS CLI JSON into an Identity value.
// Kept as a separate helper so it can be unit-tested without a real AWS CLI.
func parseIdentity(data []byte) (Identity, error) {
	var raw awsIdentityResponse
	if err := json.Unmarshal(data, &raw); err != nil {
		return Identity{}, fmt.Errorf("parse sts identity: %w", err)
	}
	return Identity{
		Account: raw.Account,
		Arn:     raw.Arn,
		UserID:  raw.UserID,
	}, nil
}

// EnsureSession checks if the AWS SSO session for profile is valid.
//
// When the session is expired:
//   - interactive=true (CLI with a real terminal): runs `aws sso login` so the
//     user can authenticate via the browser.
//   - interactive=false (headless web server): returns an error immediately
//     instead of launching `aws sso login`. There is no TTY for the user to
//     complete the login, so an interactive login would block the run forever.
//     The web UI must drive the SSO login flow separately (the SSO button /
//     /api/aws/sso-login) and retry.
//
// The caller identity check is bounded by identityTimeout so a stalled token
// refresh can't hang the run. When expectedAccount is set, the resolved account
// must match it.
func EnsureSession(ctx context.Context, profile, expectedAccount string, interactive bool) error {
	start := time.Now()
	account, err := callerAccount(ctx, profile)
	if err == nil {
		slog.Debug("aws session valid", "profile", profile, "elapsed", time.Since(start))
		return verifyAccount(profile, account, expectedAccount)
	}
	slog.Warn("aws session check failed", "profile", profile, "interactive", interactive, "elapsed", time.Since(start), "err", err)

	if !interactive {
		return fmt.Errorf("AWS session for profile %q is expired or unavailable — log in via the SSO button (or run `aws sso login --profile %s`) and retry: %w", profile, profile, err)
	}

	fmt.Printf("  Session expired for %s — logging in...\n", profile)
	slog.Info("aws sso login starting", "profile", profile)
	login := exec.Command("aws", "sso", "login", "--profile", profile)
	login.Stdin = os.Stdin
	login.Stdout = os.Stdout
	login.Stderr = os.Stderr
	if err := login.Run(); err != nil {
		slog.Warn("aws sso login failed", "profile", profile, "err", err)
		return err
	}
	account, err = callerAccount(ctx, profile)
	if err != nil {
		slog.Warn("aws session still invalid after login", "profile", profile, "err", err)
		return fmt.Errorf("verify AWS session for %s: %w", profile, err)
	}
	slog.Info("aws sso login succeeded", "profile", profile)
	return verifyAccount(profile, account, expectedAccount)
}

func callerAccount(ctx context.Context, profile string) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, identityTimeout)
	defer cancel()
	check := exec.CommandContext(ctx, "aws", "sts", "get-caller-identity", "--query", "Account", "--output", "text")
	check.Env = append(os.Environ(), "AWS_PROFILE="+profile)
	out, err := check.Output()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("aws sts get-caller-identity timed out after %s", identityTimeout)
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func verifyAccount(profile, actual, expected string) error {
	if expected != "" && actual != expected {
		return fmt.Errorf("AWS profile %s resolved account %s; expected %s", profile, actual, expected)
	}
	return nil
}
