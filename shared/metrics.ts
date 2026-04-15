// Minimal Metric and MetricsBatch types for compatibility

export interface Metric {
  timestamp: number;
  host: string;
  service: string;
  metricName: string;
  value: number;
  tags?: { [key: string]: string };
}

export interface MetricsBatch {
  batchId: string;
  metrics: Metric[];
}
