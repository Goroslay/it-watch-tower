import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import MetricsValidator from './metricsValidator';

test('accepts agent metrics with prometheus-compatible names', () => {
  const validator = new MetricsValidator();

  const result = validator.validate({
    timestamp: Date.now(),
    host: 'host-a',
    service: 'system',
    metricName: 'system_cpu_usage_percent',
    metricValue: 42,
    tags: { agent: 'agent-a' },
  });

  assert.equal(result.valid, true);
});

test('rejects invalid metric values', () => {
  const validator = new MetricsValidator();

  const result = validator.validate({
    timestamp: Date.now(),
    host: 'host-a',
    service: 'system',
    metricName: 'system_cpu_usage_percent',
    metricValue: Number.NaN,
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(','), /valid number/);
});
