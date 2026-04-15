import config from './config';
import { Logger } from './config/logger';
import NatsConsumer from './services/natsConsumer';
import VictoriaMetricsClient from './services/victoriaMetricsClient';
import MetricsValidator from './validators/metricsValidator';
import MetricsEnricher from './enrichers/metricsEnricher';

const logger = new Logger('MetricsProcessor', config.service.logLevel);

async function main(): Promise<void> {
  try {
    logger.info('Starting Metrics Processor', {
      version: config.service.version,
      environment: config.service.environment,
    });

    // Initialize services
    const natsConsumer = new NatsConsumer(config.nats.url, config.nats.user, config.nats.password);
    const vmClient = new VictoriaMetricsClient(
      config.victoriaMetrics.url,
      config.victoriaMetrics.batchSize,
      config.victoriaMetrics.flushIntervalMs
    );
    const validator = new MetricsValidator();
    const enricher = new MetricsEnricher(config.service.environment);

    // Connect to NATS
    await natsConsumer.connect();

    // Check VictoriaMetrics health
    const vmHealthy = await vmClient.health();
    if (!vmHealthy) {
      logger.warn('VictoriaMetrics is not responding to health checks');
    }

    // Subscribe to metrics topic
    await natsConsumer.subscribeToMetrics('metrics.>', async (batch) => {
      try {
        logger.debug(`Received metrics batch`, {
          batchId: batch.batchId,
          count: batch.metrics.length,
          sourceAgent: batch.sourceAgent,
        });

        // Validate metrics
        const { validMetrics, invalidMetrics } = validator.validateBatch(batch.metrics);

        if (invalidMetrics.length > 0) {
          logger.warn(`Invalid metrics in batch`, {
            invalid: invalidMetrics.length,
            valid: validMetrics.length,
          });
        }

        // Enrich valid metrics
        const enrichedMetrics = enricher.enrichBatch(validMetrics);

        // Write to VictoriaMetrics
        await vmClient.addMetrics(enrichedMetrics);

        logger.debug(`Processed metrics batch`, {
          batchId: batch.batchId,
          processed: validMetrics.length,
          invalid: invalidMetrics.length,
        });
      } catch (error) {
        logger.error('Error processing metrics batch', error as Error);
      }
    });

    logger.info('Metrics Processor started successfully');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await vmClient.shutdown();
      await natsConsumer.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down...');
      await vmClient.shutdown();
      await natsConsumer.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Fatal error', error as Error);
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
