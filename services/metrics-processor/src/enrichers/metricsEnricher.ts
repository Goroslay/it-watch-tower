import { Logger } from '../config/logger';
import { Metric } from '@itwatchtower/shared';

/**
 * Metrics enricher
 */
export class MetricsEnricher {
  private logger: Logger;
  private environment: string;

  constructor(environment: string) {
    this.logger = new Logger('MetricsEnricher');
    this.environment = environment;
  }

  /**
   * Enrich a metric with additional tags
   */
  enrich(metric: Metric): Metric {
    const enrichedMetric = { ...metric };

    // Add environment tag
    if (!enrichedMetric.tags) {
      enrichedMetric.tags = {};
    }

    if (!enrichedMetric.tags.environment) {
      enrichedMetric.tags.environment = this.environment;
    }

    // Add processor version
    enrichedMetric.tags.processor_version = '0.0.1';

    // Ensure timestamp is in the correct format
    if (enrichedMetric.timestamp < 1000000000000) {
      // If timestamp is in seconds, convert to milliseconds
      enrichedMetric.timestamp = enrichedMetric.timestamp * 1000;
    }

    return enrichedMetric;
  }

  /**
   * Enrich multiple metrics
   */
  enrichBatch(metrics: Metric[]): Metric[] {
    return metrics.map((metric) => this.enrich(metric));
  }
}

export default MetricsEnricher;
