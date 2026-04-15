/**
 * NATS configuration
 */
export interface NatsConfig {
  url: string;
  user?: string;
  password?: string;
  name?: string;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

/**
 * VictoriaMetrics configuration
 */
export interface VictoriaMetricsConfig {
  url: string;
  timeout?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}

/**
 * ClickHouse configuration
 */
export interface ClickHouseConfig {
  url: string;
  database: string;
  user?: string;
  password?: string;
  timeout?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  name: string;
  version: string;
  environment: 'development' | 'production' | 'staging';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  port?: number;
  host?: string;
}
