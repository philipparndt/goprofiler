package main

import (
	"io/fs"

	"github.com/philipparndt/go-logger"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	fe "github.com/philipparndt/goprofiler/internal/frontend"
)

func main() {
	logger.Init("debug", logger.Logger())

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
