#!/usr/bin/env sh
set -eu

COMPOSE="${COMPOSE:-docker compose}"

$COMPOSE build metrics-processor itwatchtower-agent
$COMPOSE up -d nats victoria-metrics metrics-processor itwatchtower-agent

wait_healthy() {
  name="$1"
  tries=60
  while [ "$tries" -gt 0 ]; do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    tries=$((tries - 1))
    sleep 2
  done

  echo "Container $name did not become healthy" >&2
  docker inspect -f '{{json .State.Health}}' "$name" >&2 || true
  return 1
}

wait_healthy itwatchtower-nats
wait_healthy itwatchtower-vm
wait_healthy metrics-processor
wait_healthy itwatchtower-agent

tries=30
metrics=""
while [ "$tries" -gt 0 ]; do
  metrics="$($COMPOSE exec -T victoria-metrics wget -q -O- 'http://127.0.0.1:8428/api/v1/label/__name__/values' || true)"
  if echo "$metrics" | grep -q 'system_cpu_usage_percent' && echo "$metrics" | grep -q 'service_up'; then
    echo "$metrics"
    echo "Phase 1 Docker smoke test passed"
    exit 0
  fi
  tries=$((tries - 1))
  sleep 2
done

echo "Expected metrics were not ingested into VictoriaMetrics" >&2
echo "$metrics" >&2
$COMPOSE logs --no-color --tail=120 metrics-processor >&2 || true
$COMPOSE logs --no-color --tail=120 itwatchtower-agent >&2 || true
exit 1
