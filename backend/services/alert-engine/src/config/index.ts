import * as dotenv from 'dotenv';
dotenv.config();

const config = {
  victoriaMetrics: {
    url: process.env.VICTORIA_METRICS_URL ?? 'http://localhost:8428',
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    db: process.env.CLICKHOUSE_DB ?? 'itwatchtower',
  },
  engine: {
    evalIntervalMs: Number(process.env.EVAL_INTERVAL_MS ?? 30000),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  },
};

export default config;
