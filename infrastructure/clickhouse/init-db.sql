CREATE DATABASE IF NOT EXISTS itwatchtower;

USE itwatchtower;

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
    INDEX idx_service service TYPE set(100) GRANULARITY 1
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
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
    INDEX idx_host host TYPE set(100) GRANULARITY 1,
    INDEX idx_service service TYPE set(100) GRANULARITY 1,
    INDEX idx_status status TYPE set(10) GRANULARITY 1
) ENGINE = MergeTree()
ORDER BY (timestamp, host, service)
PARTITION BY toYYYYMM(timestamp);
