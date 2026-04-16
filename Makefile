.PHONY: all build build-frontend build-backend dev dev-frontend dev-backend clean

all: build

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

# Run the built binary
run: build
	./bin/goprofiler

clean:
	rm -rf bin/
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf internal/frontend/dist
	mkdir -p internal/frontend/dist
	@echo '<!DOCTYPE html><html><body>Build frontend first</body></html>' > internal/frontend/dist/index.html
