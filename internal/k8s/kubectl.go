package k8s

import (
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

var (
	kubectlOnce sync.Once
	kubectlPath string
)

// kubectlBin resolves the kubectl binary. PATH is tried first; if that fails
// (GUI apps launched from Finder get a minimal PATH that misses Homebrew,
// Rancher Desktop, Docker Desktop, etc.), well-known install locations are
// checked directly.
func kubectlBin() string {
	kubectlOnce.Do(func() {
		if p, err := exec.LookPath("kubectl"); err == nil {
			kubectlPath = p
			return
		}
		home, _ := os.UserHomeDir()
		candidates := []string{
			filepath.Join(home, ".rd", "bin", "kubectl"), // Rancher Desktop
			"/opt/homebrew/bin/kubectl",                  // Homebrew (Apple Silicon)
			"/usr/local/bin/kubectl",                     // Homebrew (Intel), Docker Desktop, OrbStack
			filepath.Join(home, ".docker", "bin", "kubectl"),
		}
		for _, c := range candidates {
			if info, err := os.Stat(c); err == nil && !info.IsDir() {
				kubectlPath = c
				return
			}
		}
		// Fall back to bare name so the exec error names the missing binary.
		kubectlPath = "kubectl"
	})
	return kubectlPath
}
