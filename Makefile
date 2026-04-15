.PHONY: help install build dev test lint format clean docker-up docker-down backend frontend

# Default target
help:
	@echo "IT Watch Tower - Available targets:"
	@echo ""
	@echo "Setup:"
	@echo "  install          - Install all dependencies"
	@echo "  setup-local      - Full local environment setup"
	@echo ""
	@echo "Development:"
	@echo "  dev              - Start backend & frontend in dev mode"
	@echo "  dev:backend      - Start only backend services"
	@echo "  dev:frontend     - Start only frontend"
	@echo "  build            - Build all projects"
	@echo "  build:backend    - Build backend only"
	@echo "  build:frontend   - Build frontend only"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  test             - Run all tests"
	@echo "  lint             - Lint all projects"
	@echo "  format           - Format code with Prettier"
	@echo "  format:check     - Check code formatting"
	@echo ""
	@echo "Docker:"
	@echo "  docker:build     - Build Docker images"
	@echo "  docker:up        - Start Docker containers (NATS, VictoriaMetrics, ClickHouse)"
	@echo "  docker:down      - Stop Docker containers"
	@echo "  docker:logs      - View Docker logs"
	@echo ""
	@echo "Cleanup:"
	@echo "  clean            - Remove build artifacts and node_modules"

install:
	npm run install-all

setup-local: install docker:up
	@echo "✅ Environment ready!"
	@echo "Backend:  http://localhost:4222 (NATS), http://localhost:8428 (VictoriaMetrics)"
	@echo "Frontend: http://localhost:3000"
	@echo "Run 'make dev' to start services"

build:
	npm run build

build:backend:
	npm run build:backend

build:frontend:
	npm run build:frontend

dev:
	npm run dev

dev:backend:
	npm run dev:backend

dev:frontend:
	npm run dev:frontend

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

format:check:
	npm run format:check

clean:
	npm run clean

docker:build:
	docker-compose build

docker:up:
	docker-compose up -d
	@echo "✅ Docker services started"
	@echo "NATS Admin: http://localhost:8222"
	@echo "VictoriaMetrics: http://localhost:8428"
	@echo "ClickHouse: http://localhost:8123"

docker:down:
	docker-compose down

docker:logs:
	docker-compose logs -f

backend:
	cd backend && npm install

frontend:
	cd frontend && npm install
