.PHONY: all build build-frontend build-backend dev dev-frontend dev-backend build-desktop dev-desktop run run-desktop clean help

all: build

help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Web app:"
	@echo "  build           Build frontend + backend (web)"
	@echo "  build-frontend  Build frontend only"
	@echo "  build-backend   Build Go binary only"
	@echo "  dev             Run frontend + backend dev servers"
	@echo "  run             Build and run the web binary"
	@echo ""
	@echo "Desktop app (Wails):"
	@echo "  build-desktop   Build native desktop app"
	@echo "  dev-desktop     Run Wails dev server with hot-reload"
	@echo "  run-desktop     Build and run the desktop app"
	@echo ""
	@echo "Other:"
	@echo "  clean           Remove all build artifacts"

# Build everything: frontend then backend (with embedded SPA)
build: build-frontend build-backend

build-frontend:
	cd frontend && npm install && npm run build
	rm -rf internal/frontend/dist
	cp -r frontend/dist internal/frontend/dist

build-backend:
	go build -o bin/goprofiler ./cmd/goprofiler

# Development: run frontend and backend concurrently
dev:
	@echo "Starting backend and frontend dev servers..."
	@echo "Backend: http://localhost:8080"
	@echo "Frontend: http://localhost:5173 (proxies /api to backend)"
	@$(MAKE) -j2 dev-backend dev-frontend

dev-frontend:
	cd frontend && npm run dev

dev-backend:
	go run ./cmd/goprofiler --log-level debug

# Desktop (Wails) build
build-desktop: build-frontend
	cp logo.png build/appicon.png
	wails build

dev-desktop:
	wails dev

# Run the built binary
run: build
	./bin/goprofiler

run-desktop: build-desktop
	open build/bin/GoProfiler.app

clean:
	rm -rf bin/
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf internal/frontend/dist
	mkdir -p internal/frontend/dist
	@echo '<!DOCTYPE html><html><body>Build frontend first</body></html>' > internal/frontend/dist/index.html
