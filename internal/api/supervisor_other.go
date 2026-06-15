//go:build !unix

package api

import "errors"

// supervisorSupported is false on non-unix platforms; runs execute in-process
// in a goroutine (the legacy behavior) and do not survive a server restart.
const supervisorSupported = false

// launchSupervisor is unsupported on non-unix platforms.
func launchSupervisor(id string, params superviseParams) (int, error) {
	return 0, errors.New("detached supervised runs are not supported on this platform")
}

// writeApprovalInput is unsupported on non-unix platforms.
func writeApprovalInput(id, value string) error {
	return errors.New("approval fifo not supported on this platform")
}

// terminateRun is a no-op on non-unix platforms.
func terminateRun(supervisorPID int) {}

// killTerraformGroup is a no-op on non-unix platforms.
func killTerraformGroup(pgid int) {}

// killSupervisor is a no-op on non-unix platforms.
func killSupervisor(supervisorPID int) {}

// supervisorAlive always reports false on non-unix platforms.
func supervisorAlive(pid int) bool { return false }
