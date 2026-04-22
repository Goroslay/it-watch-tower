import * as dotenv from 'dotenv';
dotenv.config();

const config = {
  server: {
    port: Number(process.env.API_PORT ?? 3003),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'itwatchtower-secret-change-in-prod',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  },
  db: {
    path: process.env.SQLITE_PATH ?? '/data/itwatchtower.db',
  },
  nats: {
    url: process.env.NATS_URL ?? 'nats://localhost:4222',
    user: process.env.NATS_USER,
    password: process.env.NATS_PASSWORD,
  },
  victoriaMetrics: {
    url: process.env.VICTORIA_METRICS_URL ?? 'http://localhost:8428',
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    db: process.env.CLICKHOUSE_DB ?? 'itwatchtower',
  },
  service: {
    logLevel: process.env.LOG_LEVEL ?? 'info',
  },
};

export default config;
