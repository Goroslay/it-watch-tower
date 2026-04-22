#!/usr/bin/env bash
# IT Watch Tower — E2E health check
set -euo pipefail

HOST="${1:-localhost}"
PASS=0
FAIL=0

green()  { echo -e "\033[32m✓ $*\033[0m"; }
red()    { echo -e "\033[31m✗ $*\033[0m"; }
yellow() { echo -e "\033[33m~ $*\033[0m"; }

check() {
  local name="$1" url="$2" expect="${3:-}"
  local out
  if out=$(curl -sf --max-time 5 "$url" 2>/dev/null); then
    if [[ -z "$expect" ]] || echo "$out" | grep -q "$expect"; then
      green "$name"
      PASS=$((PASS+1))
    else
      red "$name (respuesta inesperada: ${out:0:80})"
      FAIL=$((FAIL+1))
    fi
  else
    red "$name (no responde en $url)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "=== IT Watch Tower — Health Check ==="
echo "Servidor: $HOST"
echo ""

echo "--- Infraestructura ---"
check "NATS admin HTTP"         "http://$HOST:8222/healthz"          ""
check "VictoriaMetrics"         "http://$HOST:8428/health"           "OK"
check "ClickHouse"              "http://$HOST:8123/ping"             "Ok"
check "Backend API"             "http://$HOST:3003/health"           "ok"
check "Frontend"                "http://$HOST:4000"                  ""

echo ""
echo "--- NATS JetStream ---"
JS=$(curl -sf "http://$HOST:8222/jsz?streams=1" 2>/dev/null || echo "{}")
STREAMS=$(echo "$JS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sum(len(a.get('stream_detail',[])) for a in d.get('account_details',[])))" 2>/dev/null || echo "?")
CONNS=$(curl -sf "http://$HOST:8222/connz" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('num_connections',0))" 2>/dev/null || echo "?")
yellow "Streams activos: $STREAMS"
yellow "Conexiones NATS: $CONNS"

echo ""
echo "--- Métricas en VictoriaMetrics ---"
METRICS=$(curl -sf "http://$HOST:8428/api/v1/label/__name__/values" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")
if [[ "$METRICS" -gt 0 ]]; then
  green "VictoriaMetrics tiene $METRICS series de métricas"
  PASS=$((PASS+1))
else
  red "VictoriaMetrics — no hay métricas almacenadas"
  FAIL=$((FAIL+1))
fi

echo ""
echo "--- Auth API ---"
TOKEN=$(curl -sf -X POST "http://$HOST:3003/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [[ -n "$TOKEN" ]]; then
  green "Login JWT exitoso"
  PASS=$((PASS+1))

  HOSTS=$(curl -sf "http://$HOST:3003/api/metrics/hosts" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; h=json.load(sys.stdin).get('hosts',[]); print(len(h),'hosts:',','.join(h))" 2>/dev/null || echo "error")
  yellow "Hosts detectados: $HOSTS"
else
  red "Login JWT fallido"
  FAIL=$((FAIL+1))
fi

echo ""
echo "=== Resultado: ${PASS} OK — ${FAIL} FAIL ==="
echo ""
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
