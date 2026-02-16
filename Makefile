.PHONY: help dev build test lint format clean install up down logs deploy

help:
	@echo "Available commands:"
	@echo "  make dev      - Start development server"
	@echo "  make build    - Build production bundle"
	@echo "  make test     - Run tests"
	@echo "  make lint     - Run linter"
	@echo "  make format   - Format code"
	@echo "  make install  - Install dependencies"
	@echo "  make up       - Start Docker Compose stack"
	@echo "  make down     - Stop Docker Compose stack"
	@echo "  make logs     - Show Docker Compose logs"
	@echo "  make deploy   - Deploy to production"
	@echo "  make clean    - Clean build artifacts"

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

format:
	pnpm format

clean:
	rm -rf .next node_modules dist

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

deploy:
	docker compose -f docker-compose.prod.yml up -d --build
