.PHONY: help install build dev test lint format clean docker-up docker-down

# Default target
help:
	@echo "IT Watch Tower - Available targets:"
	@echo "  install       - Install all dependencies"
	@echo "  build         - Build all services"
	@echo "  dev           - Start all services in dev mode"
	@echo "  test          - Run all tests"
	@echo "  lint          - Run linting on all services"
	@echo "  format        - Format code with Prettier"
	@echo "  format-check  - Check code formatting"
	@echo "  clean         - Clean build artifacts and node_modules"
	@echo "  docker-build  - Build Docker images"
	@echo "  docker-up     - Start Docker containers"
	@echo "  docker-down   - Stop Docker containers"
	@echo "  docker-logs   - View Docker logs"

install:
	npm install

build:
	npm run build

dev:
	npm run dev

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format:check

clean:
	npm run clean

docker-build:
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

setup-local:
	@echo "Setting up local development environment..."
	cp .env.example .env
	$(MAKE) install
	$(MAKE) docker-up
	@echo "Environment ready. Run 'make dev' to start services"
