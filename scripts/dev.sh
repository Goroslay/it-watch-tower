#!/bin/bash
# Development startup script

set -e

echo "🚀 Starting IT Watch Tower services..."

# Check if Docker services are running
if ! docker ps | grep -q itwatchtower-nats; then
  echo "🐳 Docker services not running. Starting..."
  docker-compose up -d
  sleep 5
fi

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building services..."
npm run build

echo "▶️  Starting services in development mode..."
npm run dev
