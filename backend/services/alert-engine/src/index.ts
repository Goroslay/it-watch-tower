import config from './config';
import { Logger } from './config/logger';
import VictoriaMetricsClient from './services/victoriaMetricsClient';
import ClickhouseClient from './services/clickhouseClient';
import Evaluator from './engine/evaluator';

const logger = new Logger('AlertEngine', config.engine.logLevel);

async function main(): Promise<void> {
  logger.info('Starting Alert Engine', { evalInterval: config.engine.evalIntervalMs });

  const vm = new VictoriaMetricsClient(config.victoriaMetrics.url);
  const ch = new ClickhouseClient(config.clickhouse.url, config.clickhouse.db);
  const evaluator = new Evaluator(vm, ch);

  const vmOk = await vm.health();
  if (!vmOk) logger.warn('VictoriaMetrics not healthy at startup');

  const chOk = await ch.health();
  if (!chOk) logger.warn('ClickHouse not healthy at startup');

  logger.info('Alert Engine started — evaluating rules');

  const interval = setInterval(() => {
    evaluator.evaluate().catch((err: Error) => logger.error('Evaluation error', err));
  }, config.engine.evalIntervalMs);

  // Run immediately on start
  await evaluator.evaluate();

  const shutdown = (): void => {
    logger.info('Shutting down...');
    clearInterval(interval);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: Error) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
