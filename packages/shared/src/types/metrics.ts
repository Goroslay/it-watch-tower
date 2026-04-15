/**
 * Metric data type
 * Represents a single metric from an agent
 */
export interface Metric {
  timestamp: number; // Unix timestamp in milliseconds
  host: string;
  service: string;
  metricName: string;
  metricValue: number;
  tags?: Record<string, string>;
  unit?: string;
}

/**
 * Metrics batch for efficient processing
 */
export interface MetricsBatch {
  batchId: string;
  timestamp: number;
  metrics: Metric[];
  sourceAgent: string;
}

/**
 * Validated metric ready for storage
 */
export interface ValidatedMetric extends Metric {
  validated: true;
  validatedAt: number;
  errors?: string[];
}
