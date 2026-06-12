package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/rogpeppe/go-internal/testscript"
)

// tf9Bin is the freshly-built tf9 binary the .txtar scripts invoke as
// `exec tf9 ...`. Building a real binary (rather than testscript.RunMain in
// process) keeps cmd/tf9/main.go untouched and exercises the actual CLI.
var tf9Bin string

func TestMain(m *testing.M) {
	os.Exit(buildAndRun(m))
}

func buildAndRun(m *testing.M) int {
	binDir, err := os.MkdirTemp("", "tf9-script-bin")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(binDir)

	tf9Bin = filepath.Join(binDir, "tf9")
	goTool := filepath.Join(runtime.GOROOT(), "bin", "go")
	build := exec.Command(goTool, "build", "-o", tf9Bin, ".")
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		panic("building tf9 for testscript failed: " + err.Error())
	}

	// A deterministic, offline `aws` shim so the runner's pre-run AWS session
	// check (internal/runner ensureSessions → aws sts get-caller-identity)
	// succeeds without real credentials. terraform_data needs no AWS provider,
	// so this only satisfies that gate.
	if err := writeFakeAWS(filepath.Join(binDir, "aws")); err != nil {
		panic(err)
	}

	return m.Run()
}

func writeFakeAWS(path string) error {
	script := `#!/bin/sh
case "$1 $2" in
  "sts get-caller-identity")
    if printf "%s " "$@" | grep -q -- "--output json"; then
      echo '{"UserId":"AIDAE2EXAMPLE","Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/e2e"}'
    else
      echo "123456789012"
    fi
    ;;
  *) : ;;
esac
exit 0
`
	return os.WriteFile(path, []byte(script), 0o755)
}

func TestScripts(t *testing.T) {
	binDir := filepath.Dir(tf9Bin)
	testscript.Run(t, testscript.Params{
		Dir: filepath.Join("testdata", "script"),
		Setup: func(e *testscript.Env) error {
			home := filepath.Join(e.WorkDir, "home")
			if err := os.MkdirAll(filepath.Join(home, ".config"), 0o755); err != nil {
				return err
			}
			e.Setenv("HOME", home)
			e.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
			// Prepend our binaries (tf9 + fake aws) ahead of the inherited PATH,
			// which still provides the real terraform.
			e.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
			// CWD-mode runs resolve the profile from AWS_PROFILE; the fake aws
			// validates it offline.
			e.Setenv("AWS_PROFILE", "e2e-profile")
			e.Setenv("TF_IN_AUTOMATION", "1")
			return nil
		},
	})
}
