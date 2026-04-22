'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { jwtDecode } from 'jwt-decode';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '../../lib/store';
import {
  fetchCurrentMetric, fetchMetricRange, fetchLogs, fetchAlerts,
  fetchHostServices, executeAction,
  MetricPoint, LogEntry, AlertEntry, HostServices,
} from '../../lib/api';
import ServiceTabs from './ServiceTabs';
import HostTree from './HostTree';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003';
const MAX_LIVE_LOGS = 200;

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-red-400', WARN: 'text-yellow-400', WARNING: 'text-yellow-400',
  INFO: 'text-blue-400', DEBUG: 'text-gray-500', FATAL: 'text-red-300',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-900/60 text-red-300',
  high:     'bg-orange-900/60 text-orange-300',
  medium:   'bg-yellow-900/60 text-yellow-300',
  low:      'bg-blue-900/60 text-blue-300',
};

function GaugeCard({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value ?? 0;
  const bar = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value !== null ? `${value}%` : '—'}</p>
      <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function SparklineCard({ label, data, color, unit = '%', domain }: {
  label: string; data: MetricPoint[]; color: string; unit?: string; domain?: [number, number];
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm mb-3">{label} — últimos 30 min</p>
      <ResponsiveContainer width="100%" height={70}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis domain={domain ?? [0, 100]} hide />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(v: number) => [`${v}${unit}`, label]}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#g-${label})`} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { token, init, clearToken } = useAuthStore();

  // Metrics state
  const [selectedHost, setSelectedHost] = useState('');
  const [cpu, setCpu]   = useState<number | null>(null);
  const [mem, setMem]   = useState<number | null>(null);
  const [disk, setDisk] = useState<number | null>(null);
  const [cpuChart,  setCpuChart]  = useState<MetricPoint[]>([]);
  const [memChart,  setMemChart]  = useState<MetricPoint[]>([]);
  const [loadChart, setLoadChart] = useState<MetricPoint[]>([]);

  // Logs state
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [logSearch, setLogSearch]   = useState('');
  const [logLevel,  setLogLevel]    = useState('');
  const [logService, setLogService] = useState('');
  const sseRef = useRef<EventSource | null>(null);

  // Alerts state
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);

  // UI state
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [services, setServices]       = useState<HostServices | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; unit?: string } | null>(null);
  const [actionResult,  setActionResult]  = useState<{ success: boolean; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { init(); }, [init]);
  useEffect(() => { if (!token) router.push('/login'); }, [token, router]);

  // Auth helpers
  const decoded = token ? (() => { try { return jwtDecode<{ role: string }>(token); } catch { return null; } })() : null;
  const isAdmin = decoded?.role === 'admin';
  const canAct  = decoded?.role === 'admin' || decoded?.role === 'operator';

  // Load services when host changes
  useEffect(() => {
    if (!selectedHost) return;
    fetchHostServices(selectedHost).then(setServices).catch(() => setServices(null));
  }, [selectedHost]);

  // Main data refresh
  const refresh = useCallback(async () => {
    if (!selectedHost) return;
    try {
      const [c, m, d, cc, mc, lc, l, a] = await Promise.all([
        fetchCurrentMetric('system_cpu_usage_percent', selectedHost),
        fetchCurrentMetric('system_memory_usage_percent', selectedHost),
        fetchCurrentMetric('system_disk_usage_percent', selectedHost),
        fetchMetricRange('system_cpu_usage_percent', selectedHost),
        fetchMetricRange('system_memory_usage_percent', selectedHost),
        fetchMetricRange('system_load_avg_1m', selectedHost),
        fetchLogs(selectedHost, 50, {
          level:   logLevel   || undefined,
          service: logService || undefined,
          search:  logSearch  || undefined,
        }),
        fetchAlerts(),
      ]);
      setCpu(c); setMem(m); setDisk(d);
      setCpuChart(cc); setMemChart(mc); setLoadChart(lc);
      setLogs(l); setAlerts(a);
      setLastUpdated(new Date().toLocaleTimeString('es-CO'));
    } catch {
      clearToken(); router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [selectedHost, logLevel, logService, logSearch, clearToken, router]);

  useEffect(() => {
    if (!selectedHost) return;
    setLoading(true);
    void refresh();
    const id = setInterval(() => { if (!liveMode) void refresh(); }, 30000);
    return () => clearInterval(id);
  }, [selectedHost, refresh, liveMode]);

  // SSE — connect when liveMode is on
  useEffect(() => {
    sseRef.current?.close();
    sseRef.current = null;
    if (!liveMode || !selectedHost || !token) return;

    setLiveLogs([]);
    const es = new EventSource(
      `${API_URL}/api/sse?host=${encodeURIComponent(selectedHost)}&token=${encodeURIComponent(token)}`,
    );
    es.addEventListener('log', (e) => {
      const entry = JSON.parse((e as MessageEvent).data) as LogEntry;
      setLiveLogs((prev) => [entry, ...prev].slice(0, MAX_LIVE_LOGS));
    });
    es.onerror = () => { es.close(); setLiveMode(false); };
    sseRef.current = es;

    return () => { es.close(); sseRef.current = null; };
  }, [liveMode, selectedHost, token]);

  const displayedLogs = liveMode ? liveLogs : logs;
  const firingAlerts  = alerts.filter((a) => a.status === 'firing');

  async function handleConfirmAction() {
    if (!confirmAction || !selectedHost) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await executeAction(selectedHost, confirmAction.action, confirmAction.unit);
      setActionResult({ success: result.success, message: result.message });
    } catch (err) {
      setActionResult({ success: false, message: (err as Error).message });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }

  if (!token) return null;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-white tracking-tight">IT Watch Tower</h1>
          {selectedHost && (
            <span className="text-blue-400 font-mono text-sm bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              {selectedHost}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          {lastUpdated && !liveMode && <span className="text-xs">Actualizado: {lastUpdated}</span>}
          {liveMode && <span className="text-xs text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />En vivo</span>}
          {isAdmin && <Link href="/admin" className="text-blue-400 hover:text-blue-300 transition text-xs">Admin</Link>}
          <button onClick={() => { clearToken(); router.push('/login'); }} className="text-gray-500 hover:text-white transition text-xs">Salir</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — host tree */}
        <aside className="w-56 bg-gray-900 border-r border-gray-800 flex-shrink-0 overflow-y-auto py-2">
          <p className="text-gray-600 text-xs px-3 py-1.5 font-semibold uppercase tracking-wider">Hosts</p>
          <HostTree selected={selectedHost} onSelect={(h) => { setSelectedHost(h); setLoading(true); }} />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-5 space-y-5">
          {!selectedHost ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Selecciona un host del panel izquierdo
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${firingAlerts.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {firingAlerts.length}
                  </p>
                  <p className="text-gray-400 text-xs mt-0.5">Alertas activas</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">{displayedLogs.length}</p>
                  <p className="text-gray-400 text-xs mt-0.5">Logs {liveMode ? 'en vivo' : 'recientes'}</p>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">{loadChart.at(-1)?.value ?? '—'}</p>
                  <p className="text-gray-400 text-xs mt-0.5">Load avg (1m)</p>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-20 text-gray-500">Cargando datos...</div>
              ) : (
                <>
                  {/* Gauges */}
                  <div className="grid grid-cols-3 gap-4">
                    <GaugeCard label="CPU"     value={cpu}  color="text-blue-400" />
                    <GaugeCard label="Memoria" value={mem}  color="text-purple-400" />
                    <GaugeCard label="Disco"   value={disk} color="text-teal-400" />
                  </div>

                  {/* Sparklines */}
                  <div className="grid grid-cols-3 gap-4">
                    <SparklineCard label="CPU"      data={cpuChart}  color="#60a5fa" />
                    <SparklineCard label="Memoria"  data={memChart}  color="#a78bfa" />
                    <SparklineCard label="Load avg" data={loadChart} color="#34d399" unit="" domain={[0, Math.max(4, (loadChart.at(-1)?.value ?? 0) * 1.5)]} />
                  </div>

                  {/* Service tabs */}
                  <ServiceTabs host={selectedHost} />

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div className="bg-gray-800 rounded-xl p-5">
                      <h2 className="text-white font-semibold mb-3 text-sm">
                        Alertas <span className="text-gray-400 font-normal">({alerts.length})</span>
                      </h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="text-gray-400 border-b border-gray-700">
                            <th className="text-left pb-2 pr-4">Tiempo</th>
                            <th className="text-left pb-2 pr-4">Host</th>
                            <th className="text-left pb-2 pr-4">Regla</th>
                            <th className="text-left pb-2 pr-4">Severidad</th>
                            <th className="text-left pb-2 pr-4">Estado</th>
                            <th className="text-left pb-2">Mensaje</th>
                          </tr></thead>
                          <tbody>
                            {alerts.map((a) => (
                              <tr key={a.alert_id} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                                <td className="py-1.5 pr-4 text-gray-500 whitespace-nowrap">{String(a.timestamp).slice(0, 19)}</td>
                                <td className="py-1.5 pr-4 font-mono text-gray-300">{a.host}</td>
                                <td className="py-1.5 pr-4 text-gray-300">{a.rule_name}</td>
                                <td className="py-1.5 pr-4">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[a.severity] ?? 'bg-gray-700 text-gray-300'}`}>
                                    {a.severity}
                                  </span>
                                </td>
                                <td className={`py-1.5 pr-4 font-semibold ${a.status === 'firing' ? 'text-red-400' : 'text-green-400'}`}>
                                  {a.status}
                                </td>
                                <td className="py-1.5 text-gray-400 max-w-xs truncate">{a.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Logs panel */}
                  <div className="bg-gray-800 rounded-xl p-5">
                    {/* Logs header + controls */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h2 className="text-white font-semibold text-sm mr-2">
                        Logs <span className="text-gray-400 font-normal">({displayedLogs.length})</span>
                      </h2>

                      {/* Search */}
                      <input
                        type="text"
                        placeholder="Buscar en mensajes..."
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void refresh()}
                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44"
                      />

                      {/* Level filter */}
                      <select value={logLevel} onChange={(e) => setLogLevel(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500">
                        <option value="">Todos los niveles</option>
                        {['ERROR','WARN','INFO','DEBUG'].map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>

                      {/* Service filter */}
                      <input
                        type="text"
                        placeholder="Servicio..."
                        value={logService}
                        onChange={(e) => setLogService(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void refresh()}
                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-28"
                      />

                      <button onClick={() => void refresh()}
                        className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded transition-colors">
                        Buscar
                      </button>

                      {(logSearch || logLevel || logService) && (
                        <button onClick={() => { setLogSearch(''); setLogLevel(''); setLogService(''); }}
                          className="text-xs text-gray-500 hover:text-white transition-colors">
                          Limpiar
                        </button>
                      )}

                      {/* Live mode toggle */}
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => setLiveMode((v) => !v)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                            liveMode
                              ? 'bg-green-600/30 text-green-400 border border-green-500/40'
                              : 'bg-gray-700 text-gray-400 hover:text-white'
                          }`}
                        >
                          {liveMode ? '● En vivo' : '○ En vivo'}
                        </button>
                      </div>
                    </div>

                    {/* Logs table */}
                    {displayedLogs.length === 0 ? (
                      <p className="text-gray-500 text-sm py-4">Sin logs que coincidan</p>
                    ) : (
                      <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-xs font-mono">
                          <thead className="sticky top-0 bg-gray-800 z-10">
                            <tr className="text-gray-400 border-b border-gray-700">
                              <th className="text-left pb-2 pr-4 font-normal">Tiempo</th>
                              <th className="text-left pb-2 pr-4 font-normal">Nivel</th>
                              <th className="text-left pb-2 pr-4 font-normal">Servicio</th>
                              <th className="text-left pb-2 font-normal">Mensaje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayedLogs.map((l, i) => (
                              <tr key={i} className="border-b border-gray-700/30 hover:bg-gray-700/20">
                                <td className="py-1 pr-4 text-gray-500 whitespace-nowrap">{String(l.timestamp).slice(0, 19)}</td>
                                <td className={`py-1 pr-4 font-semibold ${LEVEL_COLORS[l.log_level] ?? 'text-gray-400'}`}>{l.log_level}</td>
                                <td className="py-1 pr-4 text-gray-400">{l.service}</td>
                                <td className="py-1 text-gray-300 max-w-xl truncate" title={l.message}>{l.message}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Actions panel */}
                  {canAct && services && (services.units.length > 0 || (isAdmin && services.restart_server_enabled)) && (
                    <div className="bg-gray-800 rounded-xl p-5">
                      <h2 className="text-white font-semibold mb-4 text-sm">Acciones</h2>
                      {actionResult && (
                        <div className={`mb-4 px-4 py-2 rounded text-sm flex items-center justify-between ${actionResult.success ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                          <span>{actionResult.message}</span>
                          <button onClick={() => setActionResult(null)} className="ml-4 text-xs opacity-60 hover:opacity-100">✕</button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3">
                        {services.units.map((unit) => (
                          <button key={unit}
                            onClick={() => setConfirmAction({ action: 'restart_service', unit })}
                            className="bg-yellow-700/40 hover:bg-yellow-600/50 text-yellow-200 text-sm px-4 py-2 rounded-lg transition-colors border border-yellow-700/50">
                            Reiniciar {unit}
                          </button>
                        ))}
                        {isAdmin && services.restart_server_enabled && (
                          <button onClick={() => setConfirmAction({ action: 'restart_server' })}
                            className="bg-red-800/40 hover:bg-red-700/50 text-red-300 text-sm px-4 py-2 rounded-lg transition-colors border border-red-700/50">
                            Reiniciar servidor
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-semibold text-base mb-3">¿Estás seguro?</h3>
            <p className="text-gray-300 text-sm mb-5">
              {confirmAction.action === 'restart_service'
                ? <><span className="text-yellow-300 font-mono">{confirmAction.unit}</span> en <span className="text-blue-400 font-mono">{selectedHost}</span></>
                : <>Reiniciar el servidor <span className="text-red-400 font-mono">{selectedHost}</span> completo</>
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmAction(null)} disabled={actionLoading}
                className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded transition-colors">Cancelar</button>
              <button onClick={() => void handleConfirmAction()} disabled={actionLoading}
                className={`text-sm px-4 py-2 rounded transition-colors disabled:opacity-50 ${
                  confirmAction.action === 'restart_server' ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-yellow-700 hover:bg-yellow-600 text-white'
                }`}>
                {actionLoading ? 'Ejecutando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
