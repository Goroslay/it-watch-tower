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
  backendApi: {
    url: process.env.BACKEND_API_URL ?? 'http://localhost:3003',
    internalSecret: process.env.INTERNAL_SECRET ?? '',
  },
  engine: {
    evalIntervalMs: Number(process.env.EVAL_INTERVAL_MS ?? 30000),
    rulesReloadIntervalMs: Number(process.env.RULES_RELOAD_INTERVAL_MS ?? 300000), // 5 min
    logLevel: process.env.LOG_LEVEL ?? 'info',
  },
  notifications: {
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? '',
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    smtpFrom: process.env.SMTP_FROM ?? '',
  },
};

export default config;
