.PHONY: all build build-frontend build-backend dev dev-frontend dev-backend build-desktop dev-desktop run run-desktop run-java-sample clean help release-brew bump-major bump-minor bump-patch

.DEFAULT_GOAL := help

CURRENT_VERSION := $(shell grep -m1 '"productVersion"' wails.json | sed 's/.*: *"\(.*\)".*/\1/')

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
	@echo "Java sample:"
	@echo "  run-java-sample Run the Java sample app for profiling"
	@echo ""
	@echo "Release:"
	@echo "  release-brew    Sign, notarize, and release to Homebrew tap (current version: $(CURRENT_VERSION))"
	@echo "  bump-major      Bump major version (X.0.0)"
	@echo "  bump-minor      Bump minor version (x.X.0)"
	@echo "  bump-patch      Bump patch version (x.x.X)"
	@echo ""
	@echo "Other:"
	@echo "  clean           Remove all build artifacts"

# Build everything: frontend then backend (with embedded SPA)
build: build-frontend build-backend

build-jmx-bridge:
	cd tools/jmx-bridge && javac JmxBridge.java && jar cfe jmx-bridge.jar JmxBridge *.class && rm -f *.class

build-frontend: build-jmx-bridge
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
#
# Sign with a stable identity if one is available: wails self-signs ad-hoc,
# which changes the code identity on every build — macOS then treats each
# build as a new app and silently drops TCC grants like Local Network access
# (kubectl/k8s API calls to LAN IPs fail with "no route to host").
CODESIGN_IDENTITY ?= $(shell security find-identity -v -p codesigning 2>/dev/null | grep -o '"Developer ID Application[^"]*"' | head -1 | tr -d '"')

build-desktop: build-frontend
	cp logo.png build/appicon.png
	wails build
ifneq ($(CODESIGN_IDENTITY),)
	codesign --force --deep --sign "$(CODESIGN_IDENTITY)" build/bin/GoProfiler.app
endif

dev-desktop:
	wails dev

# Run the built binary
run: build
	./bin/goprofiler

run-desktop: build-desktop
	open build/bin/GoProfiler.app

# Java sample app
run-java-sample:
	cd examples/java-sample && javac SampleApp.java && java \
		-Dcom.sun.management.jmxremote.port=9999 \
		-Dcom.sun.management.jmxremote.authenticate=false \
		-Dcom.sun.management.jmxremote.ssl=false \
		SampleApp

# Release to Homebrew tap: signed, notarized build + GitHub release + cask update
release-brew:
	@TAG=$${TAG:-v$(CURRENT_VERSION)}; \
	if git tag -l "$$TAG" | grep -q "$$TAG"; then \
		echo "Error: Tag $$TAG already exists. Bump the version first with make bump-major/bump-minor/bump-patch."; \
		exit 1; \
	fi; \
	./scripts/release-brew.sh $$TAG

bump-major:
	@MAJOR=$$(echo $(CURRENT_VERSION) | cut -d. -f1); \
	NEW_VERSION=$$((MAJOR + 1)).0.0; \
	/usr/bin/sed -i '' "s/\"productVersion\": \"$(CURRENT_VERSION)\"/\"productVersion\": \"$$NEW_VERSION\"/" wails.json; \
	echo "Version bumped: $(CURRENT_VERSION) -> $$NEW_VERSION"

bump-minor:
	@MAJOR=$$(echo $(CURRENT_VERSION) | cut -d. -f1); \
	MINOR=$$(echo $(CURRENT_VERSION) | cut -d. -f2); \
	NEW_VERSION=$$MAJOR.$$((MINOR + 1)).0; \
	/usr/bin/sed -i '' "s/\"productVersion\": \"$(CURRENT_VERSION)\"/\"productVersion\": \"$$NEW_VERSION\"/" wails.json; \
	echo "Version bumped: $(CURRENT_VERSION) -> $$NEW_VERSION"

bump-patch:
	@MAJOR=$$(echo $(CURRENT_VERSION) | cut -d. -f1); \
	MINOR=$$(echo $(CURRENT_VERSION) | cut -d. -f2); \
	PATCH=$$(echo $(CURRENT_VERSION) | cut -d. -f3); \
	NEW_VERSION=$$MAJOR.$$MINOR.$$((PATCH + 1)); \
	/usr/bin/sed -i '' "s/\"productVersion\": \"$(CURRENT_VERSION)\"/\"productVersion\": \"$$NEW_VERSION\"/" wails.json; \
	echo "Version bumped: $(CURRENT_VERSION) -> $$NEW_VERSION"

clean:
	rm -rf bin/
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf internal/frontend/dist
	mkdir -p internal/frontend/dist
	@echo '<!DOCTYPE html><html><body>Build frontend first</body></html>' > internal/frontend/dist/index.html
