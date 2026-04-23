const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('itw_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return data.token;
}

export async function fetchHosts(): Promise<string[]> {
  const data = await request<{ hosts: string[] }>('/api/metrics/hosts');
  return data.hosts;
}

export interface MetricPoint {
  time: string;
  value: number;
}

export async function fetchMetricRange(metricName: string, host: string): Promise<MetricPoint[]> {
  const now = Math.floor(Date.now() / 1000);
  const start = now - 1800; // last 30 min
  const query = `${metricName}{host="${host}"}`;
  const data = await request<{
    data: { result: Array<{ values: [number, string][] }> };
  }>(`/api/metrics/query?query=${encodeURIComponent(query)}&start=${start}&end=${now}&step=60`);

  const result = data.data?.result?.[0];
  if (!result) return [];

  return result.values.map(([ts, val]) => ({
    time: new Date(ts * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    value: Math.round(parseFloat(val) * 10) / 10,
  }));
}

export async function fetchCurrentMetric(metricName: string, host: string): Promise<number | null> {
  const query = `${metricName}{host="${host}"}`;
  const data = await request<{
    data: { result: Array<{ value: [number, string] }> };
  }>(`/api/metrics/query?query=${encodeURIComponent(query)}`);

  const result = data.data?.result?.[0];
  if (!result) return null;
  return Math.round(parseFloat(result.value[1]) * 10) / 10;
}

export interface LogEntry {
  timestamp: string;
  host: string;
  service: string;
  log_level: string;
  message: string;
}

export async function fetchLogs(
  host?: string,
  limit = 30,
  opts: { level?: string; service?: string; search?: string; offset?: number } = {},
): Promise<LogEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (host)          params.set('host', host);
  if (opts.level)    params.set('level', opts.level);
  if (opts.service)  params.set('service', opts.service);
  if (opts.search)   params.set('search', opts.search);
  if (opts.offset)   params.set('offset', String(opts.offset));
  const data = await request<{ logs: LogEntry[] }>(`/api/logs?${params}`);
  return data.logs;
}

export interface HostInfo {
  hostname: string;
  ip_address: string;
  status: string;
  last_seen: string;
  agent_version: string;
  client_id: string | null;
  client_name: string | null;
  env_id: string | null;
  env_name: string | null;
  env_type: string | null;
}

export async function fetchHostsInfo(): Promise<HostInfo[]> {
  const data = await request<{ hosts: HostInfo[] }>('/api/metrics/hosts/info');
  return data.hosts;
}

export interface AlertEntry {
  timestamp: string;
  alert_id: string;
  host: string;
  rule_name: string;
  severity: string;
  status: string;
  message: string;
  fired_at: string;
}

export interface RawSeries {
  metric: Record<string, string>;
  value: number;
}

export async function fetchRawMetric(promql: string): Promise<RawSeries[]> {
  const data = await request<{
    data: { result: Array<{ metric: Record<string, string>; value: [number, string] }> };
  }>(`/api/metrics/query?query=${encodeURIComponent(promql)}`);
  return (data.data?.result ?? []).map((r) => ({
    metric: r.metric,
    value: Math.round(parseFloat(r.value[1]) * 100) / 100,
  }));
}

export async function fetchAlerts(status?: string): Promise<AlertEntry[]> {
  const params = status ? `?status=${status}` : '';
  const data = await request<{ alerts: AlertEntry[] }>(`/api/alerts${params}`);
  return data.alerts;
}

// ── Admin types ────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Environment {
  id: string;
  client_id: string;
  name: string;
  type: string;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  role: string;
  client_id: string | null;
  created_at: string;
}

export interface HostEntry {
  hostname: string;
  ip_address: string;
  platform: string;
  os_version: string;
  agent_version: string;
  status: string;
  client_id: string | null;
  environment_id: string | null;
  last_seen: string;
  first_seen: string;
}

// ── Admin: clients ─────────────────────────────────────────────────────────────

export async function fetchClients(): Promise<Client[]> {
  const data = await request<{ clients: Client[] }>('/admin/clients');
  return data.clients;
}

export async function createClient(name: string, description: string): Promise<Client> {
  return request<Client>('/admin/clients', { method: 'POST', body: JSON.stringify({ name, description }) });
}

export async function deleteClient(id: string): Promise<void> {
  await request(`/admin/clients/${id}`, { method: 'DELETE' });
}

// ── Admin: environments ────────────────────────────────────────────────────────

export async function fetchEnvironments(clientId?: string): Promise<Environment[]> {
  const q = clientId ? `?client_id=${clientId}` : '';
  const data = await request<{ environments: Environment[] }>(`/admin/environments${q}`);
  return data.environments;
}

export async function createEnvironment(clientId: string, name: string, type: string): Promise<Environment> {
  return request<Environment>('/admin/environments', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, name, type }),
  });
}

export async function deleteEnvironment(id: string): Promise<void> {
  await request(`/admin/environments/${id}`, { method: 'DELETE' });
}

// ── Admin: users ───────────────────────────────────────────────────────────────

export async function fetchUsers(): Promise<User[]> {
  const data = await request<{ users: User[] }>('/admin/users');
  return data.users;
}

export async function createUser(username: string, password: string, role: string, clientId?: string): Promise<User> {
  return request<User>('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role, client_id: clientId ?? null }),
  });
}

export async function deleteUser(id: string): Promise<void> {
  await request(`/admin/users/${id}`, { method: 'DELETE' });
}

// ── Admin: hosts ───────────────────────────────────────────────────────────────

export async function fetchAdminHosts(): Promise<HostEntry[]> {
  const data = await request<{ hosts: HostEntry[] }>('/admin/hosts');
  return data.hosts;
}

export async function fetchUnassignedHosts(): Promise<HostEntry[]> {
  const data = await request<{ hosts: HostEntry[] }>('/admin/hosts/unassigned');
  return data.hosts;
}

export async function assignHost(hostname: string, clientId: string, environmentId: string): Promise<void> {
  await request(`/admin/hosts/${hostname}/assign`, {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, environment_id: environmentId }),
  });
}

export async function unassignHost(hostname: string): Promise<void> {
  await request(`/admin/hosts/${hostname}/assign`, { method: 'DELETE' });
}

// ── Alert rules ───────────────────────────────────────────────────────────────

export interface AlertRule {
  id: string;
  name: string;
  promql: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  for_count: number;
  enabled: number;
  notify_slack: number;
  notify_email: string;
  created_at: string;
}

export async function fetchAlertRules(): Promise<AlertRule[]> {
  const data = await request<{ rules: AlertRule[] }>('/admin/alert-rules');
  return data.rules;
}

export async function createAlertRule(body: Omit<AlertRule, 'id' | 'created_at'>): Promise<AlertRule> {
  return request<AlertRule>('/admin/alert-rules', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateAlertRule(id: string, body: Partial<Omit<AlertRule, 'id' | 'created_at'>>): Promise<AlertRule> {
  return request<AlertRule>(`/admin/alert-rules/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deleteAlertRule(id: string): Promise<void> {
  await request(`/admin/alert-rules/${id}`, { method: 'DELETE' });
}

// ── Actions ────────────────────────────────────────────────────────────────────

export interface HostServices {
  units: string[];
  pm2_processes: string[];
  log_cleanup_paths: string[];
  restart_server_enabled: boolean;
  supported_actions: string[];
}

export interface ActionResult {
  id: string;
  success: boolean;
  message: string;
  executed_at: number;
}

export async function fetchHostServices(hostname: string): Promise<HostServices> {
  return request<HostServices>(`/api/actions/services/${encodeURIComponent(hostname)}`);
}

export async function executeAction(hostname: string, action: string, unit?: string): Promise<ActionResult> {
  return request<ActionResult>('/api/actions', {
    method: 'POST',
    body: JSON.stringify({ hostname, action, unit }),
  });
}

// ── Audit ──────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  username: string;
  action: string;
  target_host: string;
  params: string;
  result: string;
  success: number;
  created_at: string;
}

export async function fetchAudit(host?: string): Promise<AuditEntry[]> {
  const q = host ? `?host=${encodeURIComponent(host)}` : '';
  const data = await request<{ audit: AuditEntry[] }>(`/api/audit${q}`);
  return data.audit;
}
