import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import CardinalityLimiter from './cardinalityLimiter';
import type { Metric } from '@itwatchtower/shared';

function metric(tags: Record<string, string> = {}, metricName = 'system_cpu_usage_percent'): Metric {
  return {
    timestamp: Date.now(),
    host: 'host-a',
    service: 'system',
    metricName,
    metricValue: 1,
    tags,
  };
}

test('allows repeated series without increasing cardinality', () => {
  const limiter = new CardinalityLimiter(1, 5, 20);

  assert.equal(limiter.check(metric({ env: 'test' })).allowed, true);
  assert.equal(limiter.check(metric({ env: 'test' })).allowed, true);
});

test('rejects metrics after unique series limit is reached', () => {
  const limiter = new CardinalityLimiter(1, 5, 20);

  assert.equal(limiter.check(metric({ env: 'test' }, 'metric_one')).allowed, true);

  const decision = limiter.check(metric({ env: 'test' }, 'metric_two'));
  assert.equal(decision.allowed, false);
  assert.match(decision.reason || '', /unique series limit/);
});

test('rejects excessive tag count and long tag values', () => {
  const limiter = new CardinalityLimiter(10, 1, 4);

  assert.equal(limiter.check(metric({ one: 'ok', two: 'ok' })).allowed, false);
  assert.equal(limiter.check(metric({ one: 'too-long' })).allowed, false);
});
