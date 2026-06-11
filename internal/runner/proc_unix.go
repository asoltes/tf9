//go:build unix

package runner

import (
	"log/slog"
	"os/exec"
	"syscall"
	"unsafe"
)

// setProcGroup puts the child terraform process into its own process group so
// the whole tree (terraform + provider plugins) can be signalled at once.
func setProcGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
}

// setForegroundTTY puts the child in its own process group AND makes that group
// the foreground group of the controlling terminal, so an interactive terraform
// can read its "Enter a value:" approval prompt from the TTY without being
// stopped by SIGTTIN. ttyFd is the child-side fd of the terminal (stdin = 0).
func setForegroundTTY(cmd *exec.Cmd, ttyFd int) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
	cmd.SysProcAttr.Foreground = true
	cmd.SysProcAttr.Ctty = ttyFd
}

// isTerminal reports whether fd refers to a real controlling terminal. It uses
// the TIOCGPGRP ioctl, which only succeeds on a tty (returns ENOTTY for pipes,
// regular files, and /dev/null), so it avoids the false positives of a plain
// character-device check.
func isTerminal(fd uintptr) bool {
	var pgrp int32
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, uintptr(syscall.TIOCGPGRP), uintptr(unsafe.Pointer(&pgrp)))
	return errno == 0
}

// signalGroup sends sig to every process in the group led by pid. A negative
// pid targets the whole process group.
func signalGroup(pid int, sig syscall.Signal) error {
	if pid <= 0 {
		return nil
	}
	return syscall.Kill(-pid, sig)
}

// KillProcessGroup force-kills the entire process group led by pid (SIGKILL).
// Used by the API force-kill path to reap a wedged terraform tree.
func KillProcessGroup(pid int) {
	if pid <= 0 {
		return
	}
	if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil {
		slog.Debug("force-kill process group failed (likely already exited)", "pid", pid, "err", err)
	}
}

// restoreTerminalForeground reasserts this process's own process group as the
// terminal foreground after a child that ran via setForegroundTTY has exited.
// It is a no-op when stdin is not a controlling terminal (TIOCSPGRP → ENOTTY).
func restoreTerminalForeground() {
	pgrp := int32(syscall.Getpgrp())
	syscall.Syscall(syscall.SYS_IOCTL, 0, uintptr(syscall.TIOCSPGRP), uintptr(unsafe.Pointer(&pgrp)))
}
