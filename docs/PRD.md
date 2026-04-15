# IT Watch Tower --- Product Requirements Document (PRD)

## 1. Overview

IT Watch Tower is a centralized monitoring and operations platform
designed for hybrid infrastructures running across on‑premise and cloud
environments. The system collects metrics, logs, and service health data
from distributed servers and presents them in a unified real‑time
dashboard.

The platform is optimized for traditional enterprise stacks that include
Linux servers, Java application servers, Node.js services, Nginx
proxies, and Oracle databases.

## 2. Objectives

-   Centralize infrastructure monitoring
-   Aggregate application logs
-   Provide real‑time dashboards
-   Detect incidents quickly
-   Enable remote operational actions
-   Organize monitoring by client and environment

## 3. Problems Addressed

Modern enterprise infrastructures frequently include: - Multiple
clients - Multiple environments (production, QA, development) - Hybrid
deployments (cloud + on‑premise) - Distributed logs - Fragmented
monitoring tools

These conditions make it difficult to detect incidents quickly and
analyze root causes.

## 4. Scope

The MVP includes: - Infrastructure metrics monitoring - Application
service monitoring - Centralized log aggregation - Alerts and
notifications - Remote operations - Multi‑client organization -
Real‑time dashboards

## 5. System Architecture

Servers run a lightweight agent that collects metrics and logs.

Architecture flow:

Servers → IT Watch Tower Agent → Message Broker → Processors → Storage →
API → Dashboard

## 6. Core Components

### Monitoring Agent

Installed on each server. Responsibilities: - Collect system metrics -
Monitor processes - Gather application metrics - Stream logs - Execute
remote actions

### Message Broker

Handles ingestion and communication between agents and backend.

Recommended technology: NATS

### Metrics Processor

Processes and validates metrics before storing them.

### Logs Processor

Parses and indexes incoming logs.

## 7. Storage

Metrics Database VictoriaMetrics

Log Database ClickHouse

Retention: Metrics: 90 days Logs: 30 days

## 8. Backend API

Handles system operations and queries.

Main endpoints: /hosts /services /metrics /logs /alerts /actions

## 9. Dashboard

Web interface providing:

-   Infrastructure health overview
-   Service status visualization
-   Metrics charts
-   Log search
-   Alert management
-   Remote operations

Suggested frontend technology: React

## 10. Organizational Model

Tenant → Client → Environment → Server → Service

Example:

Tenant: Organization Client: Cartagena Environment: Production Server:
clicartgenap01 Service: Tomcat

## 11. Infrastructure Metrics

Collected metrics include: - CPU usage - Memory usage - Disk
utilization - Disk I/O - Network throughput - Load average - File
descriptors - Process resource usage

## 12. Application Monitoring

Supported services:

Nginx Tomcat Wildfly Node.js / PM2 Oracle Database

### Example Metrics

Nginx - requests/sec - active connections - HTTP codes

Tomcat - heap usage - GC activity - thread usage

Node - memory - event loop lag

Oracle - sessions - locks - wait events

## 13. Log Management

Logs collected:

Nginx access.log Nginx error.log Tomcat catalina.out Wildfly server.log
PM2 logs System logs

Filters: - host - service - log level - time range

## 14. Alerts

Examples:

CPU \> 90% for 5 minutes Oracle sessions \> 80% Tomcat heap \> 85% Nginx
5xx rate \> 5%

Alerts generate dashboard notifications and events.

## 15. Remote Operations

Operators can execute actions remotely via the dashboard.

Supported actions (MVP):

Restart service Start service Stop service Restart server Restart PM2
processes Log cleanup

Execution flow:

Dashboard → API → Broker → Agent → OS command

## 16. Security

-   TLS communication
-   Command whitelisting
-   Role‑based access control
-   Confirmation for critical actions

## 17. Roles

Administrator Full system control

Operator Monitoring + limited actions

Viewer Read‑only access

## 18. Audit Logs

Every action recorded with: - user - timestamp - host - action - result

## 19. Performance Requirements

Target scale: 100--150 monitored servers

Metrics frequency: 10 seconds

Central server baseline: 8 CPU cores 32 GB RAM 1--2 TB storage

## 20. Roadmap

Phase 1 Agent Metrics collection Logs Dashboard Alerts Remote actions

Phase 2 Automatic service discovery Event correlation Custom dashboards

Phase 3 Anomaly detection Root cause analysis Capacity forecasting
Integrations

## 21. User Interaction Flows

### Incident Investigation Flow

1.  Alert is triggered (CPU \> threshold).
2.  Operator receives notification.
3.  Operator opens dashboard.
4.  Navigates to affected host.
5.  Inspects system metrics timeline.
6.  Correlates with application metrics.
7.  Searches related logs.
8.  Executes remediation action (restart service).
9.  Incident recorded in audit log.

### Service Failure Flow

1.  Service health check fails.
2.  Alert generated.
3.  Operator inspects service dashboard.
4.  Logs and metrics correlated.
5.  Operator restarts service or escalates.

## 22. Alert Engine Design

Alert states:

OK → Pending → Firing → Resolved

Components:

-   Rule evaluator
-   Time window processor
-   Deduplication system
-   Alert grouping
-   Silence windows

Evaluation interval: 10 seconds.

## 23. Notification Channels

Supported notification channels:

-   Email
-   Slack
-   Webhooks
-   PagerDuty-compatible integrations

Each alert rule can configure:

-   notification targets
-   escalation rules
-   silence schedules

## 24. Metrics Priority Model

Core infrastructure metrics:

-   CPU usage
-   Memory usage
-   Disk utilization
-   Network throughput

Advanced metrics:

-   File descriptor usage
-   IO latency
-   Kernel metrics
-   Process-level resource metrics

## 25. Scalability Targets

Future scalability target:

-   1000+ monitored servers
-   50k+ metrics/sec ingestion
-   1TB/day log ingestion

System components should support horizontal scaling.
