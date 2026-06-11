//go:build unix

package api

import (
	"os"
	"syscall"
)

func killProcessGroup(process *os.Process) error {
	return syscall.Kill(-process.Pid, syscall.SIGKILL)
}
