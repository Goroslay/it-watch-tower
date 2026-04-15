#!/bin/bash
# Setup script for local development environment

set -e

echo "🚀 IT Watch Tower - Local Development Setup"
echo "============================================"

# Check if .env exists
if [ ! -f .env ]; then
  echo "📝 Creating .env file from .env.example..."
  cp .env.example .env
  echo "✅ .env created. Please update with your settings if needed."
else
  echo "✅ .env already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Please install Docker to continue."
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo "❌ Docker Compose is not installed. Please install Docker Compose to continue."
  exit 1
fi

echo "✅ Docker is available"

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check if services are running
echo ""
echo "🔍 Service Status:"
echo "===================="

# Check NATS
if curl -s http://localhost:8222/varz > /dev/null; then
  echo "✅ NATS is running on http://localhost:8222"
else
  echo "❌ NATS is not responding"
fi

# Check VictoriaMetrics
if curl -s http://localhost:8428/health > /dev/null; then
  echo "✅ VictoriaMetrics is running on http://localhost:8428"
else
  echo "❌ VictoriaMetrics is not responding"
fi

# Check ClickHouse
if curl -s http://localhost:8123/ping > /dev/null; then
  echo "✅ ClickHouse is running on http://localhost:8123"
else
  echo "❌ ClickHouse is not responding"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "1. Install Go 1.20+ for the agent: https://golang.org/doc/install"
echo "2. Run 'npm run dev' to start services in development mode"
echo "3. Visit http://localhost:3000 for the dashboard"
echo ""
echo "📖 For more info, see README.md"
