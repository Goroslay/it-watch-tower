# IT Watch Tower --- Technical Design Document (TDD)

## 1. Architecture Overview

The system follows an agent‑based architecture where each monitored
server runs a lightweight collector that streams telemetry to the
central platform.

System layers:

Agents Messaging Layer Processing Layer Storage Layer API Layer UI Layer

## 2. Agent Design

### Responsibilities

-   Collect system metrics
-   Detect running services
-   Gather service‑specific metrics
-   Stream logs
-   Execute remote commands

### Modules

Metrics Collector Log Collector Service Detector Remote Executor
Communication Client

### Runtime Model

Scheduler loop

Every 10s → system metrics Every 15s → application metrics Continuous →
log streaming

## 3. Communication Protocol

Agents communicate with the backend using NATS.

Message topics examples:

metrics.system metrics.service logs.stream actions.execute

Example metric payload:

{ host: "server01", metric: "cpu_usage", value: 73, timestamp:
1710000000 }

## 4. Metrics Pipeline

Agent → NATS → Metrics Processor → VictoriaMetrics

Metrics Processor tasks:

validation tag enrichment aggregation storage write

## 5. Logs Pipeline

Agent → NATS → Logs Processor → ClickHouse

Logs schema:

timestamp host service level message

## 6. Remote Actions

Execution workflow:

User action → API request → publish action message → agent receives
command → execute system command → return result

Example payload:

{ action: "restart_service", service: "tomcat", host: "server01" }

## 7. Service Detection

Agent scans running processes.

Examples detected:

nginx tomcat wildfly node oracle

Process identification via:

ps systemctl known ports

## 8. API Design

Main endpoints:

GET /hosts GET /services GET /metrics GET /logs POST /actions GET
/alerts

Authentication:

JWT tokens

## 9. Dashboard Architecture

Frontend framework: React

Real‑time updates:

WebSockets or Server‑Sent Events

Charts library options:

ECharts Recharts

## 10. Scaling Strategy

Scaling components independently:

Message broker cluster Metrics processors Logs processors API instances

Storage scaling:

VictoriaMetrics clustering ClickHouse distributed tables

## 11. Security Design

Agent authentication using tokens TLS encryption Action command
whitelist Audit logs for every operation

## 12. Deployment

Core services deployed on central infrastructure:

NATS VictoriaMetrics ClickHouse Backend API Dashboard

Agents installed via package or binary.

System service:

systemctl enable itwatchtower-agent

## 13. Agent Versioning

Agents include version metadata:

-   agent_version
-   protocol_version
-   supported_capabilities

Backend validates compatibility during connection.

## 14. Plugin System for Service Monitoring

The agent supports a plugin architecture for service monitoring.

Plugin responsibilities:

-   collect service metrics
-   parse service logs
-   define service health checks

Examples:

-   nginx plugin
-   tomcat plugin
-   oracle plugin
-   node plugin

## 15. Pipeline Resilience

To handle bursts of logs and metrics the messaging layer supports
streaming durability.

Recommended configuration:

NATS JetStream enabled

Capabilities:

-   message persistence
-   replay
-   consumer groups
-   backpressure control

## 16. Cardinality Control

Metrics ingestion enforces label policies.

Restrictions:

-   limit dynamic labels
-   normalize tag values
-   enforce cardinality thresholds

Example forbidden pattern:

http_requests{user_id=\*}

## 17. Remote Command Security

Remote executor uses a command whitelist.

Example configuration:

allowed_commands:

restart_nginx: command: systemctl restart nginx

restart_tomcat: command: systemctl restart tomcat

Security controls:

-   role-based access control
-   execution audit logs
-   command confirmation
-   execution timeout

## 18. Log Processing Backpressure

Logs processors implement:

-   batch ingestion
-   retry queues
-   temporary buffering
-   failure retry strategies

If storage becomes unavailable messages remain in the streaming layer.

## 19. Scaling Strategy Enhancement

Scaling model:

Agents → NATS JetStream cluster → Stream consumers → Processing workers
→ Storage clusters

This allows independent scaling of:

-   ingestion
-   processing
-   storage
