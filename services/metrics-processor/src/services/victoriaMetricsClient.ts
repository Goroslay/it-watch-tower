import axios, { AxiosInstance } from 'axios';
import { Logger } from '../config/logger';
import { Metric } from '@itwatchtower/shared';

/**
 * VictoriaMetrics client for writing metrics
 */
export class VictoriaMetricsClient {
  private client: AxiosInstance;
  private logger: Logger;
  private batchSize: number;
  private flushIntervalMs: number;
  private batch: Metric[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(url: string, batchSize: number = 100, flushIntervalMs: number = 5000) {
    this.client = axios.create({
      baseURL: url,
      timeout: 10000,
    });
    this.logger = new Logger('VictoriaMetricsClient');
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;

    // Start periodic flush timer
    this.startFlushTimer();
  }

  /**
   * Add a metric to the batch
   */
  async addMetric(metric: Metric): Promise<void> {
    this.batch.push(metric);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Add multiple metrics to the batch
   */
  async addMetrics(metrics: Metric[]): Promise<void> {
    this.batch.push(...metrics);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush all batched metrics to VictoriaMetrics
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) {
      return;
    }

    const metricsToFlush = this.batch.splice(0, this.batchSize);

    try {
      const lines = metricsToFlush.map((metric) => this.metricToPromQL(metric)).join('\n');

      await this.client.post('/api/put', lines, {
        headers: {
          'Content-Type': 'text/plain',
        },
      });

      this.logger.debug(`Flushed ${metricsToFlush.length} metrics to VictoriaMetrics`);
    } catch (error) {
      this.logger.error('Failed to flush metrics to VictoriaMetrics', error as Error);
      // Re-add failed metrics back to the batch
      this.batch.unshift(...metricsToFlush);
      throw error;
    }
  }

  /**
   * Convert a metric to PromQL format
   */
  private metricToPromQL(metric: Metric): string {
    const tags = metric.tags || {};
    const tagString = Object.entries({ host: metric.host, service: metric.service, ...tags })
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    const metricName = metric.metricName.replace(/\./g, '_');
    const timestamp = metric.timestamp;
    const value = metric.metricValue;

    return `${metricName}{${tagString}} ${value} ${timestamp}`;
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flush();
      } catch (error) {
        this.logger.error('Error in periodic flush', error as Error);
      }
    }, this.flushIntervalMs);
  }

  /**
   * Stop the flush timer and flush remaining metrics
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    this.logger.info('VictoriaMetrics client shutdown');
  }

  /**
   * Check health of VictoriaMetrics
   */
  async health(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default VictoriaMetricsClient;
