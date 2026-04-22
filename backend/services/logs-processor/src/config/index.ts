import * as dotenv from 'dotenv';
dotenv.config();

const config = {
  nats: {
    url: process.env.NATS_URL ?? 'nats://localhost:4222',
    user: process.env.NATS_USER,
    password: process.env.NATS_PASSWORD,
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
