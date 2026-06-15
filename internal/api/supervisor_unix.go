//go:build unix

package api

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/andres/tf9/internal/config"
	"github.com/andres/tf9/internal/runner"
)

// supervisorSupported reports whether detached supervised runs are available on
// this platform. On unix they are; the server spawns a detached `tf9
// __supervise` process so terraform survives a server restart.
const supervisorSupported = true

// launchSupervisor writes request.json, creates the approval FIFO, and spawns a
// detached `tf9 __supervise <id>` process whose lifetime is independent of this
// server. Returns the supervisor pid.
func launchSupervisor(id string, params superviseParams) (int, error) {
	dir := config.RunDir(id)
	params.ID = id
	if err := writeJSONAtomic(filepath.Join(dir, requestFile), params); err != nil {
		return 0, fmt.Errorf("write run request: %w", err)
	}
	fifo := filepath.Join(dir, inputFifo)
	if err := os.Remove(fifo); err != nil && !os.IsNotExist(err) {
		return 0, fmt.Errorf("clear stale fifo: %w", err)
	}
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		return 0, fmt.Errorf("create approval fifo: %w", err)
	}

	exe, err := os.Executable()
	if err != nil {
		return 0, fmt.Errorf("resolve tf9 executable: %w", err)
	}
	cmd := exec.Command(exe, "__supervise", id)
	// Inherit the config path override so the supervisor reads the same config.
	if path := config.ConfigPath(); path != "" {
		cmd.Args = append(cmd.Args, "--config", path)
	}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	runner.DetachSession(cmd)
	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("start supervisor: %w", err)
	}
	pid := cmd.Process.Pid
	// Reap the immediate child handle without blocking; the process lives on in
	// its own session regardless of this server's lifetime.
	go func() { _ = cmd.Wait() }()
	return pid, nil
}

// writeApprovalInput sends a single approval value to the run's FIFO. Opening
// for write blocks until the supervisor's reader is ready, so it is done in a
// short-lived goroutine-safe call; the supervisor closes its read side per
// message via EOF handling.
func writeApprovalInput(id, value string) error {
	fifo := filepath.Join(config.RunDir(id), inputFifo)
	f, err := os.OpenFile(fifo, os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(value + "\n")
	return err
}

// signalProcessGroup sends sig to the process group led by pid. A no-op when
// pid is unknown.
func signalProcessGroup(pid int, sig syscall.Signal) {
	if pid <= 0 {
		return
	}
	_ = syscall.Kill(-pid, sig)
}

// terminateRun gracefully asks a run (identified by its supervisor pid) to stop
// by sending SIGTERM to the supervisor's process group, which cascades to
// terraform via the supervisor's signal handler.
func terminateRun(supervisorPID int) { signalProcessGroup(supervisorPID, syscall.SIGTERM) }

// killTerraformGroup force-kills the terraform process group (pgid).
func killTerraformGroup(pgid int) { signalProcessGroup(pgid, syscall.SIGKILL) }

// killSupervisor force-kills the supervisor's process group.
func killSupervisor(supervisorPID int) { signalProcessGroup(supervisorPID, syscall.SIGKILL) }

// supervisorAlive reports whether the supervisor process recorded in meta is
// still running.
func supervisorAlive(pid int) bool {
	return runner.ProcessAlive(pid)
}
