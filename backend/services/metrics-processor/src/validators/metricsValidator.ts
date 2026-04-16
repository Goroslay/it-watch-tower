import { Logger } from '../config/logger';
import type { Metric } from '@itwatchtower/shared';

/**
 * Metric validator
 */
export class MetricsValidator {
  private logger: Logger;
  private errors: string[] = [];

  constructor() {
    this.logger = new Logger('MetricsValidator');
  }

  /**
   * Validate a single metric
   */
  validate(metric: Metric): { valid: boolean; errors: string[] } {
    this.errors = [];

    if (!metric.timestamp || metric.timestamp <= 0) {
      this.errors.push('Invalid timestamp');
    }

    if (!metric.host || metric.host.trim() === '') {
      this.errors.push('Host is required');
    }

    if (!metric.service || metric.service.trim() === '') {
      this.errors.push('Service is required');
    }

    if (!metric.metricName || metric.metricName.trim() === '') {
      this.errors.push('Metric name is required');
    }

    if (metric.metricName && !this.isValidMetricName(metric.metricName)) {
      this.errors.push('Invalid metric name format');
    }

    if (typeof metric.metricValue !== 'number' || isNaN(metric.metricValue) || !isFinite(metric.metricValue)) {
      this.errors.push('Metric value must be a valid number');
    }

    if (metric.tags) {
      for (const [key, value] of Object.entries(metric.tags)) {
        if (!key || key.trim() === '') {
          this.errors.push('Tag key cannot be empty');
        }
        if (typeof value !== 'string') {
          this.errors.push(`Tag value for "${key}" must be a string`);
        }
      }
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
    };
  }

  /**
   * Validate metric name format
   */
  private isValidMetricName(name: string): boolean {
    return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name.replace(/\./g, '_'));
  }

  /**
   * Validate batch of metrics
   */
  validateBatch(metrics: Metric[]): { validMetrics: Metric[]; invalidMetrics: Array<{ metric: Metric; errors: string[] }> } {
    const validMetrics: Metric[] = [];
    const invalidMetrics: Array<{ metric: Metric; errors: string[] }> = [];

    for (const metric of metrics) {
      const validation = this.validate(metric);
      if (validation.valid) {
        validMetrics.push(metric);
      } else {
        invalidMetrics.push({
          metric,
          errors: validation.errors,
        });
      }
    }

    if (invalidMetrics.length > 0) {
      this.logger.warn(`Found ${invalidMetrics.length} invalid metrics in batch`, {
        total: metrics.length,
      });
    }

    return { validMetrics, invalidMetrics };
  }
}

export default MetricsValidator;
