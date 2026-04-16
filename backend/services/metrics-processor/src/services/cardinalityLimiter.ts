import type { Metric } from '@itwatchtower/shared';

export interface CardinalityDecision {
  allowed: boolean;
  reason?: string;
}

export class CardinalityLimiter {
  private readonly seenSeries = new Set<string>();

  constructor(
    private readonly maxUniqueSeries: number,
    private readonly maxTagKeys: number,
    private readonly maxTagValueLength: number
  ) {}

  check(metric: Metric): CardinalityDecision {
    const tags = metric.tags || {};
    const tagEntries = Object.entries(tags);

    if (tagEntries.length > this.maxTagKeys) {
      return {
        allowed: false,
        reason: `too many tags: ${tagEntries.length} > ${this.maxTagKeys}`,
      };
    }

    for (const [key, value] of tagEntries) {
      if (value.length > this.maxTagValueLength) {
        return {
          allowed: false,
          reason: `tag "${key}" exceeds max length ${this.maxTagValueLength}`,
        };
      }
    }

    const seriesKey = this.seriesKey(metric);
    if (!this.seenSeries.has(seriesKey) && this.seenSeries.size >= this.maxUniqueSeries) {
      return {
        allowed: false,
        reason: `unique series limit reached: ${this.maxUniqueSeries}`,
      };
    }

    this.seenSeries.add(seriesKey);
    return { allowed: true };
  }

  filter(metrics: Metric[]): { accepted: Metric[]; rejected: Array<{ metric: Metric; reason: string }> } {
    const accepted: Metric[] = [];
    const rejected: Array<{ metric: Metric; reason: string }> = [];

    for (const metric of metrics) {
      const decision = this.check(metric);
      if (decision.allowed) {
        accepted.push(metric);
      } else {
        rejected.push({ metric, reason: decision.reason || 'cardinality limit exceeded' });
      }
    }

    return { accepted, rejected };
  }

  private seriesKey(metric: Metric): string {
    const tags = Object.entries(metric.tags || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    return `${metric.host}|${metric.service}|${metric.metricName}|${tags}`;
  }
}

export default CardinalityLimiter;
