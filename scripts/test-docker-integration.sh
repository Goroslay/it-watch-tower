#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_URL="${API_URL:-http://backend-api:3003}"
HOSTNAME="${INTEGRATION_HOST:-integration-host}"

docker compose up -d --build nats victoria-metrics clickhouse metrics-processor logs-processor backend-api alert-engine frontend

echo "Waiting for backend-api..."
for _ in $(seq 1 60); do
  if docker compose exec -T backend-api wget -q -O- http://localhost:3003/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker compose exec -T backend-api node <<'NODE'
const { connect, StringCodec } = require('nats');

const apiUrl = process.env.API_URL || 'http://backend-api:3003';
const hostname = process.env.INTEGRATION_HOST || 'integration-host';
const sc = StringCodec();

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${res.status} ${url}: ${text}`);
  return body;
}

async function retry(fn, label) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw lastError || new Error(`Timed out waiting for ${label}`);
}

(async () => {
  const nats = await connect({
    servers: ['nats://nats:4222'],
    user: 'agent',
    pass: 'agent-password',
  });

  nats.publish('agents.register', sc.encode(JSON.stringify({
    hostname,
    ip_address: '127.0.0.1',
    platform: 'linux',
    arch: 'amd64',
    os_version: 'integration',
    agent_version: 'integration',
    detected_services: ['nginx'],
    allowed_units: ['nginx.service'],
    allowed_pm2_processes: ['api'],
    allowed_log_cleanup_paths: ['/tmp/integration.log'],
    restart_server_enabled: false,
  })));

  const now = Date.now();
  nats.publish(`metrics.${hostname}`, sc.encode(JSON.stringify({
    batchId: `integration-${now}`,
    timestamp: now,
    sourceAgent: 'integration-test',
    metrics: [{
      timestamp: now,
      host: hostname,
      service: 'system',
      metricName: 'system_cpu_usage_percent',
      metricValue: 42,
      tags: { agent: 'integration-test' },
      unit: 'percent',
    }],
  })));

  nats.publish(`logs.${hostname}`, sc.encode(JSON.stringify({
    batchId: `integration-log-${now}`,
    timestamp: now,
    sourceAgent: 'integration-test',
    logs: [{
      timestamp: now,
      host: hostname,
      service: 'integration',
      level: 'INFO',
      message: 'integration log line',
      metadata: { agent: 'integration-test' },
    }],
  })));

  await nats.flush();
  await nats.close();

  const login = await jsonFetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin' }),
  });
  const headers = { Authorization: `Bearer ${login.token}` };

  await retry(async () => {
    const hosts = await jsonFetch(`${apiUrl}/api/metrics/hosts/info`, { headers });
    return hosts.hosts?.some((host) => host.hostname === hostname);
  }, 'host registration');

  await retry(async () => {
    const query = encodeURIComponent(`system_cpu_usage_percent{host="${hostname}"}`);
    const metrics = await jsonFetch(`${apiUrl}/api/metrics/query?query=${query}`, { headers });
    return (metrics.data?.result || []).length > 0;
  }, 'metric ingestion');

  await retry(async () => {
    const logs = await jsonFetch(`${apiUrl}/api/logs?host=${encodeURIComponent(hostname)}&limit=5`, { headers });
    return logs.logs?.some((log) => log.message === 'integration log line');
  }, 'log ingestion');

  const services = await jsonFetch(`${apiUrl}/api/actions/services/${encodeURIComponent(hostname)}`, { headers });
  if (!services.units?.includes('nginx.service') || !services.pm2_processes?.includes('api')) {
    throw new Error('action whitelist was not exposed by API');
  }

  console.log('Docker integration smoke passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
