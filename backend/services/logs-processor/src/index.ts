import config from './config';
import { Logger } from './config/logger';
import NatsConsumer from './services/natsConsumer';
import ClickhouseClient from './services/clickhouseClient';

const logger = new Logger('LogsProcessor', config.service.logLevel);

function toClickhouseTs(tsMs: number): string {
  return new Date(tsMs).toISOString().replace('T', ' ').substring(0, 19);
}

async function main(): Promise<void> {
  logger.info('Starting Logs Processor');

  const nats = new NatsConsumer(config.nats.url, config.nats.user, config.nats.password);
  const ch = new ClickhouseClient(config.clickhouse.url, config.clickhouse.db);

  await nats.connect();

  const healthy = await ch.health();
  if (!healthy) logger.warn('ClickHouse not healthy at startup');

  await nats.subscribeLogs(async (batch) => {
    if (batch.logs.length === 0) return;

    const rows = batch.logs.map((entry) => ({
      timestamp: toClickhouseTs(entry.timestamp),
      host: entry.host,
      service: entry.service,
      log_level: entry.level,
      message: entry.message,
      metadata: entry.metadata ?? {},
    }));

    await ch.insertLogs(rows);
    logger.info('Inserted log batch', { count: rows.length, host: rows[0]?.host });
  });

  logger.info('Logs Processor started');

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await nats.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: Error) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
