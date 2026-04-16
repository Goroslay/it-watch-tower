import config from './config';
import { Logger } from './config/logger';
import NatsConsumer from './services/natsConsumer';
import VictoriaMetricsClient from './services/victoriaMetricsClient';
import MetricsValidator from './validators/metricsValidator';
import MetricsEnricher from './enrichers/metricsEnricher';
import CardinalityLimiter from './services/cardinalityLimiter';

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
    const cardinalityLimiter = new CardinalityLimiter(
      config.processing.maxUniqueSeries,
      config.processing.maxTagKeys,
      config.processing.maxTagValueLength
    );

    // Connect to NATS
    await natsConsumer.connect();

    // Check VictoriaMetrics health
    const vmHealthy = await vmClient.health();
    if (!vmHealthy) {
      logger.warn('VictoriaMetrics is not responding to health checks');
    }

    // Subscribe to metrics topic
    await natsConsumer.subscribeToMetrics(config.processing.metricsSubject, async (batch) => {
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

          await natsConsumer.publishDeadLetter(config.processing.deadLetterSubject, {
            batchId: batch.batchId,
            sourceAgent: batch.sourceAgent,
            reason: 'validation_failed',
            invalidMetrics,
            receivedAt: Date.now(),
          });
        }

        // Enrich valid metrics
        const enrichedMetrics = enricher.enrichBatch(validMetrics);
        const { accepted, rejected } = cardinalityLimiter.filter(enrichedMetrics);

        if (rejected.length > 0) {
          logger.warn('Dropped high-cardinality metrics', {
            batchId: batch.batchId,
            dropped: rejected.length,
          });

          await natsConsumer.publishDeadLetter(config.processing.deadLetterSubject, {
            batchId: batch.batchId,
            sourceAgent: batch.sourceAgent,
            reason: 'cardinality_limit',
            rejectedMetrics: rejected,
            receivedAt: Date.now(),
          });
        }

        // Write to VictoriaMetrics
        await vmClient.addMetrics(accepted);

        logger.debug(`Processed metrics batch`, {
          batchId: batch.batchId,
          processed: accepted.length,
          invalid: invalidMetrics.length,
          dropped: rejected.length,
        });
      } catch (error) {
        logger.error('Error processing metrics batch', error as Error);
        throw error;
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
