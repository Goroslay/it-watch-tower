# System Architecture

Project: IT Watch Tower

IT Watch Tower is a distributed monitoring and operations platform designed
to monitor hybrid infrastructures across cloud and on-premise environments.

## High Level Architecture

Servers
  → Monitoring Agent
  → Message Broker
  → Processing Pipelines
  → Storage
  → API
  → Dashboard

## Main Components

Monitoring Agent
Runs on each server and collects system metrics, application metrics,
and logs. It also executes remote operational commands.

Message Broker
Responsible for telemetry ingestion and decoupling producers
from processors.

Metrics Processor
Processes system and application metrics before storing them.

Logs Processor
Parses and indexes logs for search and correlation.

Alert Engine
Evaluates monitoring rules and generates alerts.

Backend API
Provides access to monitoring data and operational commands.

Dashboard
User interface for visualization, alert management, and operations.

## Data Flow

Agent → Broker → Processor → Storage → API → Dashboard

## Storage

Metrics:
VictoriaMetrics

Logs:
ClickHouse

## Scaling Model

Agents
 → Broker cluster
 → Processing workers
 → Storage clusters
 → API instances