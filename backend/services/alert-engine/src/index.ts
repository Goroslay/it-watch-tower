import config from './config';
import { Logger } from './config/logger';
import VictoriaMetricsClient from './services/victoriaMetricsClient';
import ClickhouseClient from './services/clickhouseClient';
import Evaluator from './engine/evaluator';

const logger = new Logger('AlertEngine', config.engine.logLevel);

async function main(): Promise<void> {
  logger.info('Starting Alert Engine', {
    evalInterval: config.engine.evalIntervalMs,
    rulesReloadInterval: config.engine.rulesReloadIntervalMs,
  });

  const vm = new VictoriaMetricsClient(config.victoriaMetrics.url);
  const ch = new ClickhouseClient(config.clickhouse.url, config.clickhouse.db);
  const evaluator = new Evaluator(vm, ch);

  const vmOk = await vm.health();
  if (!vmOk) logger.warn('VictoriaMetrics not healthy at startup');

  const chOk = await ch.health();
  if (!chOk) logger.warn('ClickHouse not healthy at startup');

  // Load rules on startup (retry until backend-api is up)
  let loaded = false;
  for (let attempt = 0; attempt < 10 && !loaded; attempt++) {
    await evaluator.loadRules();
    loaded = true;
    if (attempt > 0) await sleep(5000);
  }

  logger.info('Alert Engine started — evaluating rules');

  // Reload rules periodically so changes take effect without restart
  setInterval(() => {
    evaluator.loadRules().catch((err: Error) => logger.error('Rules reload failed', err));
  }, config.engine.rulesReloadIntervalMs);

  const evalInterval = setInterval(() => {
    evaluator.evaluate().catch((err: Error) => logger.error('Evaluation error', err));
  }, config.engine.evalIntervalMs);

  await evaluator.evaluate();

  const shutdown = (): void => {
    logger.info('Shutting down...');
    clearInterval(evalInterval);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err: Error) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
