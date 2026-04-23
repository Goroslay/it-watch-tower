import assert from 'node:assert/strict';
import test from 'node:test';
import { isPromqlAllowedForHosts } from '../metrics';
import { isActionAllowedForHost, HostRow } from '../actions';

test('PromQL host scope allows admin queries', () => {
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent', null), true);
});

test('PromQL host scope requires an allowed host for non-admin users', () => {
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent{host="app01"}', ['app01']), true);
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent{host="db01"}', ['app01']), false);
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent', ['app01']), false);
});

test('PromQL host scope rejects negative host matchers', () => {
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent{host!="db01"}', ['app01']), false);
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent{host!~"db.*"}', ['app01']), false);
});

test('PromQL host scope allows simple regex alternations inside the allowed set', () => {
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent{host=~"app01|app02"}', ['app01', 'app02']), true);
  assert.equal(isPromqlAllowedForHosts('system_cpu_usage_percent{host=~"app01|db01"}', ['app01', 'app02']), false);
});

test('action RBAC requires host whitelists', () => {
  const host: HostRow = {
    client_id: 'client-1',
    allowed_units: '["nginx.service"]',
    allowed_pm2_processes: '["api"]',
    allowed_log_cleanup_paths: '["/var/log/app.log"]',
    restart_server_enabled: 1,
  };

  assert.equal(isActionAllowedForHost('restart_service', 'nginx.service', host), true);
  assert.equal(isActionAllowedForHost('start_service', 'postgres.service', host), false);
  assert.equal(isActionAllowedForHost('restart_pm2', 'api', host), true);
  assert.equal(isActionAllowedForHost('restart_pm2', 'worker', host), false);
  assert.equal(isActionAllowedForHost('log_cleanup', '/var/log/app.log', host), true);
  assert.equal(isActionAllowedForHost('restart_server', '', host), true);
  assert.equal(isActionAllowedForHost('unknown', '', host), false);
});
