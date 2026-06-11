//go:build !unix

package runner

import (
	"os/exec"
	"syscall"
)

// setProcGroup is a no-op on non-unix platforms.
func setProcGroup(cmd *exec.Cmd) {}

// setForegroundTTY is a no-op on non-unix platforms.
func setForegroundTTY(cmd *exec.Cmd, ttyFd int) {}

// isTerminal is unsupported on non-unix platforms.
func isTerminal(fd uintptr) bool { return false }

// signalGroup is a no-op on non-unix platforms.
func signalGroup(pid int, sig syscall.Signal) error { return nil }

// KillProcessGroup is a no-op on non-unix platforms.
func KillProcessGroup(pid int) {}

// restoreTerminalForeground is a no-op on non-unix platforms.
func restoreTerminalForeground() {}
