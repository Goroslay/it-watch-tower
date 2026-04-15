import * as dotenv from 'dotenv';

dotenv.config();

interface AppConfig {
  service: {
    name: string;
    version: string;
    environment: string;
    logLevel: string;
  };
  nats: {
    url: string;
    user?: string;
    password?: string;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
  };
  victoriaMetrics: {
    url: string;
    timeout: number;
    batchSize: number;
    flushIntervalMs: number;
  };
}

const config: AppConfig = {
  service: {
    name: process.env.SERVICE_NAME || 'metrics-processor',
    version: process.env.SERVICE_VERSION || '0.0.1',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  nats: {
    url: process.env.NATS_URL || 'nats://localhost:4222',
    user: process.env.NATS_USER,
    password: process.env.NATS_PASSWORD,
    reconnectDelayMs: 5000,
    maxReconnectAttempts: 10,
  },
  victoriaMetrics: {
    url: process.env.VICTORIA_METRICS_URL || 'http://localhost:8428',
    timeout: 10000,
    batchSize: 100,
    flushIntervalMs: 5000,
  },
};

export default config;
