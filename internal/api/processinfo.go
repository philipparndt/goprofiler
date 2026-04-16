package api

import (
	"io"
	"net/http"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type processInfoResponse struct {
	Cmdline   []string `json:"cmdline"`
	GoVersion string   `json:"goVersion,omitempty"`
	GOOS      string   `json:"goos,omitempty"`
	GOARCH    string   `json:"goarch,omitempty"`
}

// Matches paths like /go/1.22.0/ or /go1.22.0/ or Cellar/go/1.26.2/
var goVersionRe = regexp.MustCompile(`/go[/.]?(\d+\.\d+\.\d+)/`)

func (h *Handler) getProcessInfo(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	target, ok := h.connections.Get(targetID)
	if !ok {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	info := &processInfoResponse{
		// Default to server's own OS/arch as a reasonable guess (same host is common)
		GOOS:   runtime.GOOS,
		GOARCH: runtime.GOARCH,
	}

	// Fetch cmdline
	if resp, err := client.Get(target.URL + "/debug/pprof/cmdline"); err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			if body, err := io.ReadAll(resp.Body); err == nil {
				raw := strings.TrimRight(string(body), "\x00")
				if raw != "" {
					info.Cmdline = strings.Split(raw, "\x00")
				}
			}
		}
	}

	// Fetch goroutine debug output to extract Go version from runtime source paths
	// e.g. "/opt/homebrew/Cellar/go/1.26.2/libexec/src/runtime/proc.go"
	if resp, err := client.Get(target.URL + "/debug/pprof/goroutine?debug=1"); err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			if body, err := io.ReadAll(resp.Body); err == nil {
				text := string(body)
				if matches := goVersionRe.FindStringSubmatch(text); len(matches) > 1 {
					info.GoVersion = "go" + matches[1]
				}

				// Detect arch from asm file names like asm_arm64.s, asm_amd64.s
				if strings.Contains(text, "asm_arm64.s") {
					info.GOARCH = "arm64"
				} else if strings.Contains(text, "asm_amd64.s") {
					info.GOARCH = "amd64"
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, info)
}
