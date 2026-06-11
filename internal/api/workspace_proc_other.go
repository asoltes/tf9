//go:build !unix

package api

import "os"

func killProcessGroup(process *os.Process) error {
	return process.Kill()
}
