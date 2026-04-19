package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/philipparndt/go-logger"
	loggerchi "github.com/philipparndt/go-logger/chi"

	"github.com/philipparndt/goprofiler/internal/api"
	"github.com/philipparndt/goprofiler/internal/connection"
	fe "github.com/philipparndt/goprofiler/internal/frontend"
	"github.com/philipparndt/goprofiler/internal/java"
	"github.com/philipparndt/goprofiler/internal/k8s"
	"github.com/philipparndt/goprofiler/internal/monitor"
	"github.com/philipparndt/goprofiler/internal/storage"
)

func main() {
	port := flag.String("port", "8080", "server port")
	dataDir := flag.String("data-dir", "", "data directory (default: ~/.goprofiler)")
	logLevel := flag.String("log-level", "info", "log level (trace, debug, info, warn, error)")
	flag.Parse()

	logger.Init(*logLevel, logger.Logger())

	if *dataDir == "" {
		home, _ := os.UserHomeDir()
		*dataDir = filepath.Join(home, ".goprofiler")
	}

	store, err := storage.NewStore(*dataDir)
	if err != nil {
		logger.Error("failed to initialize storage", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	home, _ := os.UserHomeDir()
	configDir := filepath.Join(home, ".config", "goprofiler")
	connStore, err := connection.NewStore(configDir)
	if err != nil {
		logger.Error("failed to initialize connection store", "error", err)
		os.Exit(1)
	}
	defer connStore.Close()

	monitorSvc := monitor.NewService()
	defer monitorSvc.Close()

	cpuMonitorSvc := monitor.NewCpuService()
	defer cpuMonitorSvc.Close()

	javaMonitorSvc := java.NewJavaMonitorService()
	defer javaMonitorSvc.Close()

	// Start monitoring for all currently active targets
	for _, t := range connStore.List() {
		if t.Language == connection.LangJava {
			javaMonitorSvc.StartTarget(t.ID, t.URL)
		} else {
			monitorSvc.StartTarget(t.ID, t.URL)
		}
	}

	// Set callbacks so monitor starts/stops with connections
	connStore.OnConnect = func(id, url string) {
		if t, ok := connStore.Get(id); ok && t.Language == connection.LangJava {
			javaMonitorSvc.StartTarget(id, url)
		} else {
			monitorSvc.StartTarget(id, url)
		}
	}
	connStore.OnDisconnect = func(id string) {
		monitorSvc.StopTarget(id)
		cpuMonitorSvc.StopTarget(id)
		javaMonitorSvc.StopTarget(id)
	}
	connStore.ValidateJava = func(url string) error {
		host, port, err := java.ParseJMXAddress(url)
		if err != nil {
			return err
		}
		return java.ValidateConnection(host, port)
	}

	portFwdMgr := k8s.NewPortForwardManager()
	defer portFwdMgr.StopAll()

	handler := api.NewHandler(connStore, store, monitorSvc, cpuMonitorSvc, javaMonitorSvc)
	handler.SetK8sConfig(&api.K8sConfig{
		PortForwardMgr: portFwdMgr,
	})

	r := chi.NewRouter()
	r.Use(loggerchi.LoggerWithLevel(slog.LevelDebug))
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	r.Mount("/api", handler.Routes())

	// Serve frontend SPA
	frontendDist, err := fs.Sub(fe.FS, "dist")
	if err != nil {
		logger.Error("failed to load frontend", "error", err)
		os.Exit(1)
	}

	fileServer := http.FileServer(http.FS(frontendDist))
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		// Try to serve static file
		path := req.URL.Path[1:] // strip leading /
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(frontendDist, path); err != nil {
			// SPA fallback: serve index.html for client-side routing
			req.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, req)
	})

	addr := fmt.Sprintf(":%s", *port)
	logger.Info("GoProfiler starting", "addr", addr, "data-dir", *dataDir)
	if err := http.ListenAndServe(addr, r); err != nil {
		logger.Error("server error", "error", err)
		os.Exit(1)
	}
}
