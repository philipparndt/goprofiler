package main

import (
	"context"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/philipparndt/go-logger"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	fe "github.com/philipparndt/goprofiler/internal/frontend"
)

// fixPathEnv replaces the minimal PATH that macOS gives GUI apps launched
// from Finder/Dock (/usr/bin:/bin:/usr/sbin:/sbin) with the user's login-shell
// PATH. Without this, external tools the app shells out to — kubectl for
// port-forwards, java/jcmd for JVM profiling, cloud auth plugins used by
// kubeconfig exec credentials — are not found even though they work fine in
// the user's terminal.
func fixPathEnv() {
	if runtime.GOOS != "darwin" {
		return
	}
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// Interactive login shell (-lic): tools like Rancher Desktop add their
	// bin dirs in .zshrc, which a plain login shell (-lc) never reads. Rc
	// files may print arbitrary output, so the PATH is wrapped in markers.
	out, err := exec.CommandContext(ctx, shell, "-lic", `printf "__PATH__%s__PATH__" "$PATH"`).Output()
	if err != nil {
		logger.Warn("could not read login-shell PATH", "shell", shell, "error", err)
		return
	}
	s := string(out)
	start := strings.Index(s, "__PATH__")
	end := strings.LastIndex(s, "__PATH__")
	if start == -1 || end <= start {
		logger.Warn("unexpected login-shell PATH output", "shell", shell)
		return
	}
	if path := strings.TrimSpace(s[start+len("__PATH__") : end]); path != "" {
		os.Setenv("PATH", path)
		logger.Info("PATH resolved from login shell", "path", path)
	}
}

func main() {
	logger.Init("debug", logger.Logger())

	// Production .app bundles on macOS discard stdout — mirror logs to a file
	// so they can be inspected with `tail -f ~/.goprofiler/app.log`.
	if home, err := os.UserHomeDir(); err == nil {
		logDir := filepath.Join(home, ".goprofiler")
		_ = os.MkdirAll(logDir, 0o755)
		if f, err := os.OpenFile(filepath.Join(logDir, "app.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
			logger.LogTo(io.MultiWriter(os.Stdout, f))
		}
	}

	fixPathEnv()

	app := NewApp()

	frontendDist, err := fs.Sub(fe.FS, "dist")
	if err != nil {
		logger.Error("failed to load frontend", err)
		return
	}

	err = wails.Run(&options.App{
		Title:  "GoProfiler",
		Width:  1280,
		Height: 900,
		AssetServer: &assetserver.Options{
			Assets: frontendDist,
		},
		Mac: &mac.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			Preferences: &mac.Preferences{
				FullscreenEnabled: mac.Enabled,
			},
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		logger.Error("wails error", err)
	}
}
