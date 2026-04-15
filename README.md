# IT Watch Tower

Enterprise monitoring and operations platform for hybrid infrastructures. Centralizes infrastructure monitoring, log aggregation, alerting, and remote operations management.

## 🎯 Overview

IT Watch Tower is a comprehensive monitoring solution designed for enterprise environments that need to monitor 100-150+ servers across different locations (on-premise and cloud). It provides centralized visibility into:

- **Infrastructure Health** - CPU, memory, disk, network monitoring
- **Application Monitoring** - Service status, logs, custom metrics
- **Log Aggregation** - Centralized log collection and search
- **Alert Management** - Rule-based alerting with state tracking
- **Remote Operations** - Execute commands safely across infrastructure
- **Dashboard** - Real-time visualization and analytics

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitored Infrastructure                  │
│  (Servers: Linux, Java Apps, Databases)                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              IT Watch Tower Agents (Go)                      │
│  • Collect metrics (CPU, memory, disk, network)             │
│  • Stream logs in real-time                                 │
│  • Detect services (Nginx, Tomcat, Wildfly, Node, Oracle)   │
│  • Execute remote commands                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         NATS Message Broker (JetStream)                      │
│  • Distributed messaging                                    │
│  • Durable subscriptions                                    │
│  • High throughput                                          │
└─────────────────────────────────────────────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
    ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
    │  Metrics Proc  │  │   Logs Proc    │  │ Alert Engine   │
    │   (Node.js)    │  │   (Node.js)    │  │   (Node.js)    │
    └────────────────┘  └────────────────┘  └────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
    ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
    │VictoriaMetrics │  │  ClickHouse    │  │ NATS (alerts)  │
    │  (Metrics DB)  │  │   (Logs DB)    │  │                │
    └────────────────┘  └────────────────┘  └────────────────┘
                            │
                            ▼
                ┌────────────────────────────┐
                │  Backend API (Express)     │
                │  • REST endpoints          │
                │  • JWT authentication      │
                │  • Real-time data          │
                └────────────────────────────┘
                            │
                            ▼
                ┌────────────────────────────┐
                │  Dashboard (React)         │
                │  • Infrastructure view     │
                │  • Metrics charts          │
                │  • Log search              │
                │  • Alert management        │
                │  • Remote operations       │
                └────────────────────────────┘
```

## 📦 Project Structure

```
it-watch-tower/
├── services/                    # Microservices
│   ├── itwatchtower-agent/     # Go agent (metrics, logs, commands)
│   ├── metrics-processor/      # Node.js - NATS → VictoriaMetrics
│   ├── logs-processor/         # Node.js - NATS → ClickHouse
│   ├── alert-engine/           # Node.js - Rule evaluation & notifications
│   ├── backend-api/            # Node.js - REST API
│   └── dashboard/              # React - Web UI
├── packages/
│   └── shared/                 # Shared types, interfaces, utilities
├── infrastructure/
│   ├── nats/                   # NATS configuration
│   └── clickhouse/             # ClickHouse initialization
├── scripts/                    # Development scripts
├── docs/                       # Documentation (PRD, TDD)
├── specs/                      # Technical specifications
├── docker-compose.yml          # Local development stack
├── Makefile                    # Build & run targets
└── package.json                # Monorepo root

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Go 1.20+ (for agent development)
- npm

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Goroslay/it-watch-tower.git
cd it-watch-tower
```

2. **Run setup script**
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:
- Create `.env` configuration file
- Install all dependencies
- Start Docker services (NATS, VictoriaMetrics, ClickHouse)
- Verify service health

3. **Start services**
```bash
npm run dev
```

Or with make:
```bash
make dev
```

### Accessing Services

| Service | URL | Purpose |
|---------|-----|---------|
| Dashboard | http://localhost:5173 | React UI (dev) |
| Backend API | http://localhost:3000 | REST API |
| NATS | nats://localhost:4222 | Message broker |
| NATS Admin | http://localhost:8222 | NATS monitoring |
| VictoriaMetrics | http://localhost:8428 | Metrics database |
| ClickHouse | http://localhost:8123 | Logs database |

## 🔧 Development

### Build All Services

```bash
npm run build
# or
make build
```

### Development Mode

```bash
npm run dev
# or
make dev
```

### Run Tests

```bash
npm run test
```

### Linting

```bash
npm run lint
```

### Code Formatting

```bash
npm run format      # Format code
npm run format:check # Check formatting
```

### Docker

```bash
make docker-build   # Build Docker images
make docker-up      # Start containers
make docker-down    # Stop containers
make docker-logs    # View logs
```

## 📚 Services Documentation

### metrics-processor

Consumes metrics from NATS agents and writes to VictoriaMetrics.

- **Language**: TypeScript/Node.js
- **Status**: ✅ Functional MVP
- **Responsibilities**:
  - Connect to NATS and consume metrics batches
  - Validate metric schema and values
  - Enrich with environment tags
  - Write to VictoriaMetrics in PromQL format
  - Batch processing with auto-flush

**Configuration**:
```bash
NATS_URL=nats://localhost:4222
VICTORIA_METRICS_URL=http://localhost:8428
LOG_LEVEL=info
```

### logs-processor

*TODO*: Consumes logs from NATS and writes to ClickHouse.

- **Language**: TypeScript/Node.js
- **Responsibilities**:
  - Parse and normalize logs
  - Index in ClickHouse
  - Support structured logging

### alert-engine

*TODO*: Evaluates alert rules and manages notification state.

- **Language**: TypeScript/Node.js
- **Responsibilities**:
  - Evaluate rules against metrics
  - Manage alert state machine (OK → Pending → Firing → Resolved)
  - Send notifications (email, Slack, PagerDuty)

### backend-api

*TODO*: REST API for dashboard and operations.

- **Language**: TypeScript/Node.js (Express)
- **Endpoints**:
  - `GET /api/hosts` - List infrastructure
  - `GET /api/services` - List services
  - `GET /api/metrics?query=...` - Query metrics
  - `GET /api/logs?search=...` - Search logs
  - `GET /api/alerts` - List alerts
  - `POST /api/actions` - Execute remote commands
  - `POST /api/auth/login` - Authenticate

### dashboard

*TODO*: React frontend for monitoring and operations.

- **Language**: React + TypeScript
- **Build Tool**: Vite
- **Features**:
  - Infrastructure overview
  - Service status dashboard
  - Metrics visualization (Recharts)
  - Log search interface
  - Alert management
  - Remote operations console

### itwatchtower-agent

*TODO*: Go agent deployed on monitored servers.

- **Language**: Go
- **Responsibilities**:
  - Collect system metrics
  - Stream logs
  - Detect and monitor services
  - Execute remote commands

## 🔐 Security

- **Authentication**: JWT tokens
- **Communication**: TLS for all connections
- **Command Execution**: Whitelist-based remote commands
- **NATS Auth**: Username/password authentication
- **Data Encryption**: TLS in transit

## 📊 Data Storage

### VictoriaMetrics (Metrics)
- **Retention**: 90 days
- **Query Language**: PromQL
- **Resolution**: 10s-15s metrics
- **Use Cases**: Performance tracking, dashboards, trending

### ClickHouse (Logs)
- **Retention**: 30 days
- **Query Language**: SQL
- **Support**: Structured logging with tags
- **Use Cases**: Log search, troubleshooting, compliance

## 🚨 Alerting

Alert rules define conditions and actions:

```javascript
{
  "name": "High CPU Usage",
  "condition": {
    "metric": "cpu_percent",
    "operator": "gt",
    "threshold": 90,
    "duration": 300000  // 5 minutes
  },
  "actions": [
    {
      "type": "email",
      "config": { "to": "oncall@example.com" }
    }
  ]
}
```

State machine: **OK** → **Pending** (duration met) → **Firing** (alert sent) → **Resolved** (condition cleared)

## 🎮 Remote Operations

Execute commands safely across infrastructure:

```bash
# Restart a service
POST /api/actions
{
  "action": "restart_service",
  "host": "app-server-01",
  "service": "nginx"
}

# Cleanup logs
POST /api/actions
{
  "action": "cleanup_logs",
  "host": "db-server-01",
  "service": "oracle"
}
```

Whitelisted actions for security.

## 📈 Performance & Scalability

- **Agent**: Lightweight Go binary (~50MB)
- **Metrics Throughput**: 10,000+ metrics/sec
- **Logs Throughput**: 50,000+ log lines/sec
- **Horizontal Scaling**: Multiple agents, processors, workers
- **Message Broker**: NATS with JetStream durability
- **Time-Series DB**: VictoriaMetrics (efficient compression)
- **Log DB**: ClickHouse (columnar compression)

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📝 Documentation

- [Product Requirements Document](docs/PRD.md)
- [Technical Design Document](docs/TDD.md)
- [Architecture Decisions](specs/000-platform-architecture/decisions.md)
- [API Specification](specs/006-dashboard-api/spec.md)

## 🛠️ Development Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make changes and test**
   ```bash
   npm run lint
   npm run format
   npm run test
   ```

3. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: description"
   git push origin feature/your-feature
   ```

4. **Create pull request**

## 📜 License

MIT

## 👥 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🤝 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation
- Review technical specifications in `/specs`

## 🔄 Roadmap

**Phase 1** ✅
- [x] Project structure
- [x] Shared types and utilities
- [x] Metrics processor MVP
- [ ] Build infrastructure

**Phase 2**
- [ ] Agent (basic metrics collection)
- [ ] Logs processor
- [ ] Basic API endpoints
- [ ] Dashboard mockups

**Phase 3**
- [ ] Alert engine
- [ ] Full API implementation
- [ ] Dashboard UI
- [ ] Remote actions

**Phase 4+**
- [ ] Auto-discovery
- [ ] Custom dashboards
- [ ] Anomaly detection
- [ ] Performance optimization
- [ ] Enterprise features

---

**Made with ❤️ for enterprise monitoring**
