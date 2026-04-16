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
  processing: {
    metricsSubject: string;
    deadLetterSubject: string;
    maxUniqueSeries: number;
    maxTagKeys: number;
    maxTagValueLength: number;
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
    batchSize: Number(process.env.VICTORIA_METRICS_BATCH_SIZE || 100),
    flushIntervalMs: Number(process.env.VICTORIA_METRICS_FLUSH_INTERVAL_MS || 5000),
  },
  processing: {
    metricsSubject: process.env.METRICS_SUBJECT || 'metrics.>',
    deadLetterSubject: process.env.METRICS_DLQ_SUBJECT || 'metrics.dlq',
    maxUniqueSeries: Number(process.env.MAX_UNIQUE_SERIES || 10000),
    maxTagKeys: Number(process.env.MAX_TAG_KEYS || 20),
    maxTagValueLength: Number(process.env.MAX_TAG_VALUE_LENGTH || 120),
  },
};

export default config;
