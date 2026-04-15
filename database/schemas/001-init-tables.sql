-- Database initialization script
-- Creates tables for metrics, logs, and alerts

CREATE DATABASE IF NOT EXISTS itwatchtower;

USE itwatchtower;

-- Hosts table
CREATE TABLE IF NOT EXISTS hosts (
    id String PRIMARY KEY,
    hostname String NOT NULL,
    ip_address String,
    platform String,
    arch String,
    agent_version String,
    status String DEFAULT 'online',
    last_heartbeat DateTime DEFAULT now(),
    created_at DateTime DEFAULT now(),
    INDEX idx_hostname hostname TYPE set(100) GRANULARITY 1,
    INDEX idx_status status TYPE set(10) GRANULARITY 1
) ENGINE = ReplacingMergeTree()
ORDER BY id;

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id String PRIMARY KEY,
    host_id String NOT NULL,
    name String NOT NULL,
    type String,
    port UInt16 DEFAULT 0,
    status String DEFAULT 'unknown',
    pid UInt32 DEFAULT 0,
    version String,
    last_heartbeat DateTime DEFAULT now(),
    created_at DateTime DEFAULT now(),
    INDEX idx_host_id host_id TYPE set(100) GRANULARITY 1,
    INDEX idx_name name TYPE set(100) GRANULARITY 1,
    INDEX idx_status status TYPE set(10) GRANULARITY 1
) ENGINE = ReplacingMergeTree()
ORDER BY (host_id, id);

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
    timestamp DateTime,
    host String,
    service String,
    metric_name String,
    metric_value Float64,
    tags Map(String, String),
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
    INDEX idx_host host TYPE set(100) GRANULARITY 1,
    INDEX idx_service service TYPE set(100) GRANULARITY 1,
    INDEX idx_metric metric_name TYPE set(100) GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (timestamp, host, service, metric_name)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 90 DAY;

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
    timestamp DateTime,
    host String,
    service String,
    log_level String,
    message String,
    metadata Map(String, String),
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
    INDEX idx_host host TYPE set(100) GRANULARITY 1,
    INDEX idx_service service TYPE set(100) GRANULARITY 1,
    INDEX idx_level log_level TYPE set(10) GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (timestamp, host, service)
PARTITION BY toYYYYMM(timestamp)
TTL timestamp + INTERVAL 30 DAY;

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    timestamp DateTime,
    alert_id String,
    host String,
    service String,
    rule_name String,
    severity String,
    status String,
    message String,
    metadata Map(String, String),
    fired_at DateTime DEFAULT '1970-01-01 00:00:00',
    resolved_at DateTime DEFAULT '1970-01-01 00:00:00',
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
    INDEX idx_host host TYPE set(100) GRANULARITY 1,
    INDEX idx_service service TYPE set(100) GRANULARITY 1,
    INDEX idx_status status TYPE set(10) GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (timestamp, host, service, alert_id);

-- Alert rules table
CREATE TABLE IF NOT EXISTS alert_rules (
    id String PRIMARY KEY,
    name String NOT NULL,
    description String,
    enabled UInt8 DEFAULT 1,
    rule_config String,  -- JSON
    severity String,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now(),
    INDEX idx_name name TYPE set(100) GRANULARITY 1,
    INDEX idx_enabled enabled TYPE set(2) GRANULARITY 1
) ENGINE = ReplacingMergeTree()
ORDER BY id;
