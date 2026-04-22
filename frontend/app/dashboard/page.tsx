'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { jwtDecode } from 'jwt-decode';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '../../lib/store';
import {
  fetchHosts,
  fetchCurrentMetric,
  fetchMetricRange,
  fetchLogs,
  fetchAlerts,
  fetchHostServices,
  executeAction,
  MetricPoint,
  LogEntry,
  AlertEntry,
  HostServices,
} from '../../lib/api';
import ServiceTabs from './ServiceTabs';

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-red-400',
  WARN: 'text-yellow-400',
  WARNING: 'text-yellow-400',
  INFO: 'text-blue-400',
  DEBUG: 'text-gray-400',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-900 text-red-300',
  high: 'bg-orange-900 text-orange-300',
  medium: 'bg-yellow-900 text-yellow-300',
  low: 'bg-blue-900 text-blue-300',
};

function GaugeCard({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value ?? 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value !== null ? `${value}%` : '—'}</p>
      <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function SparklineCard({ label, data, color }: { label: string; data: MetricPoint[]; color: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm mb-3">{label} — últimos 30 min</p>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis domain={[0, 100]} hide />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(v: number) => [`${v}%`, label]}
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

  const [hosts, setHosts] = useState<string[]>([]);
  const [selectedHost, setSelectedHost] = useState('');
  const [cpu, setCpu] = useState<number | null>(null);
  const [mem, setMem] = useState<number | null>(null);
  const [disk, setDisk] = useState<number | null>(null);
  const [cpuChart, setCpuChart] = useState<MetricPoint[]>([]);
  const [memChart, setMemChart] = useState<MetricPoint[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<HostServices | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; unit?: string } | null>(null);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (!token) router.push('/login');
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    fetchHosts().then((h) => {
      setHosts(h);
      if (h.length > 0) setSelectedHost(h[0]);
    }).catch(() => { clearToken(); router.push('/login'); });
  }, [token, clearToken, router]);

  useEffect(() => {
    if (!selectedHost) return;
    fetchHostServices(selectedHost).then(setServices).catch(() => setServices(null));
  }, [selectedHost]);

  const refresh = useCallback(async () => {
    if (!selectedHost) return;
    try {
      const [c, m, d, cc, mc, l, a] = await Promise.all([
        fetchCurrentMetric('system_cpu_usage_percent', selectedHost),
        fetchCurrentMetric('system_memory_usage_percent', selectedHost),
        fetchCurrentMetric('system_disk_usage_percent', selectedHost),
        fetchMetricRange('system_cpu_usage_percent', selectedHost),
        fetchMetricRange('system_memory_usage_percent', selectedHost),
        fetchLogs(selectedHost, 20),
        fetchAlerts(),
      ]);
      setCpu(c); setMem(m); setDisk(d);
      setCpuChart(cc); setMemChart(mc);
      setLogs(l); setAlerts(a);
      setLastUpdated(new Date().toLocaleTimeString('es-CO'));
    } catch {
      // token expired
      clearToken(); router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [selectedHost, clearToken, router]);

  useEffect(() => {
    if (!selectedHost) return;
    setLoading(true);
    void refresh();
    const id = setInterval(() => void refresh(), 30000);
    return () => clearInterval(id);
  }, [selectedHost, refresh]);

  const firingAlerts = alerts.filter((a) => a.status === 'firing');
  const decoded = token ? (() => { try { return jwtDecode<{ role: string }>(token); } catch { return null; } })() : null;
  const isAdmin = decoded?.role === 'admin';
  const canAct = decoded?.role === 'admin' || decoded?.role === 'operator';

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
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white">IT Watch Tower</h1>
          {hosts.length > 0 && (
            <select
              value={selectedHost}
              onChange={(e) => setSelectedHost(e.target.value)}
              className="bg-gray-700 text-white text-sm rounded-lg px-3 py-1 border border-gray-600"
            >
              {hosts.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          {lastUpdated && <span>Actualizado: {lastUpdated}</span>}
          {isAdmin && (
            <Link href="/admin" className="text-blue-400 hover:text-blue-300 transition">
              Admin
            </Link>
          )}
          <button onClick={() => { clearToken(); router.push('/login'); }} className="text-gray-500 hover:text-white transition">
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{hosts.length}</p>
            <p className="text-gray-400 text-sm">Hosts monitoreados</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${firingAlerts.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {firingAlerts.length}
            </p>
            <p className="text-gray-400 text-sm">Alertas activas</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{logs.length}</p>
            <p className="text-gray-400 text-sm">Logs recientes</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-500">Cargando datos...</div>
        ) : (
          <>
            {/* Metric gauges */}
            <div className="grid grid-cols-3 gap-4">
              <GaugeCard label="CPU" value={cpu} color="text-blue-400" />
              <GaugeCard label="Memoria" value={mem} color="text-purple-400" />
              <GaugeCard label="Disco" value={disk} color="text-teal-400" />
            </div>

            {/* Sparklines */}
            <div className="grid grid-cols-2 gap-4">
              <SparklineCard label="CPU" data={cpuChart} color="#60a5fa" />
              <SparklineCard label="Memoria" data={memChart} color="#a78bfa" />
            </div>

            {/* Alerts */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">
                Alertas{' '}
                <span className="text-sm font-normal text-gray-400">({alerts.length})</span>
              </h2>
              {alerts.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay alertas</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-left border-b border-gray-700">
                        <th className="pb-2 pr-4">Tiempo</th>
                        <th className="pb-2 pr-4">Host</th>
                        <th className="pb-2 pr-4">Regla</th>
                        <th className="pb-2 pr-4">Severidad</th>
                        <th className="pb-2 pr-4">Estado</th>
                        <th className="pb-2">Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((a) => (
                        <tr key={a.alert_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">{String(a.timestamp).slice(0, 19)}</td>
                          <td className="py-2 pr-4 text-white font-mono text-xs">{a.host}</td>
                          <td className="py-2 pr-4 text-gray-300">{a.rule_name}</td>
                          <td className="py-2 pr-4">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[a.severity] ?? 'bg-gray-700 text-gray-300'}`}>
                              {a.severity}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <span className={a.status === 'firing' ? 'text-red-400' : 'text-green-400'}>
                              {a.status}
                            </span>
                          </td>
                          <td className="py-2 text-gray-400 text-xs max-w-xs truncate">{a.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Logs */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">
                Logs recientes{' '}
                <span className="text-sm font-normal text-gray-400">({logs.length})</span>
              </h2>
              {logs.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay logs disponibles</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className="text-gray-400 text-left border-b border-gray-700">
                        <th className="pb-2 pr-4">Tiempo</th>
                        <th className="pb-2 pr-4">Nivel</th>
                        <th className="pb-2 pr-4">Servicio</th>
                        <th className="pb-2">Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l, i) => (
                        <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="py-1.5 pr-4 text-gray-500 whitespace-nowrap text-xs">{String(l.timestamp).slice(0, 19)}</td>
                          <td className={`py-1.5 pr-4 text-xs font-semibold ${LEVEL_COLORS[l.log_level] ?? 'text-gray-400'}`}>
                            {l.log_level}
                          </td>
                          <td className="py-1.5 pr-4 text-gray-400 text-xs">{l.service}</td>
                          <td className="py-1.5 text-gray-300 text-xs max-w-lg truncate">{l.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Service tabs */}
        {selectedHost && <ServiceTabs host={selectedHost} />}

        {/* Actions panel */}
        {canAct && services && (services.units.length > 0 || (isAdmin && services.restart_server_enabled)) && (
          <div className="bg-gray-800 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Acciones — <span className="text-blue-400 font-mono text-sm">{selectedHost}</span></h2>

            {actionResult && (
              <div className={`mb-4 px-4 py-2 rounded text-sm flex items-center justify-between ${actionResult.success ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                <span>{actionResult.message}</span>
                <button onClick={() => setActionResult(null)} className="ml-4 text-xs opacity-60 hover:opacity-100">✕</button>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {services.units.map((unit) => (
                <button
                  key={unit}
                  onClick={() => setConfirmAction({ action: 'restart_service', unit })}
                  className="bg-yellow-700/40 hover:bg-yellow-600/50 text-yellow-200 text-sm px-4 py-2 rounded-lg transition-colors border border-yellow-700/50"
                >
                  Reiniciar {unit}
                </button>
              ))}
              {isAdmin && services.restart_server_enabled && (
                <button
                  onClick={() => setConfirmAction({ action: 'restart_server' })}
                  className="bg-red-800/40 hover:bg-red-700/50 text-red-300 text-sm px-4 py-2 rounded-lg transition-colors border border-red-700/50"
                >
                  Reiniciar servidor
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-semibold text-base mb-3">¿Estás seguro?</h3>
            <p className="text-gray-300 text-sm mb-5">
              {confirmAction.action === 'restart_service'
                ? <>Reiniciar <span className="text-yellow-300 font-mono">{confirmAction.unit}</span> en <span className="text-blue-400 font-mono">{selectedHost}</span></>
                : <>Reiniciar el servidor <span className="text-red-400 font-mono">{selectedHost}</span> completo</>
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={actionLoading}
                className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleConfirmAction()}
                disabled={actionLoading}
                className={`text-sm px-4 py-2 rounded transition-colors disabled:opacity-50 ${
                  confirmAction.action === 'restart_server'
                    ? 'bg-red-700 hover:bg-red-600 text-white'
                    : 'bg-yellow-700 hover:bg-yellow-600 text-white'
                }`}
              >
                {actionLoading ? 'Ejecutando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
