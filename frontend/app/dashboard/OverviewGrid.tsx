'use client';
import { useEffect, useState, useCallback } from 'react';
import { fetchRawMetric, fetchAlerts, fetchHostsInfo, type RawSeries, type HostInfo } from '../../lib/api';

interface HostMetrics {
  cpu:    number | null;
  mem:    number | null;
  disk:   number | null;
  alerts: number;
}

const STATUS_DOT: Record<string, string> = {
  online:  'bg-green-400',
  offline: 'bg-red-400',
};

export function GaugeMini({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value ?? 0;
  const bar = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : color;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className={value !== null ? 'text-white' : 'text-gray-600'}>
          {value !== null ? `${value}%` : '—'}
        </span>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function toHostMap(series: RawSeries[]): Map<string, number> {
  return new Map(series.map((s) => [s.metric['host'] ?? '', s.value]));
}

function FilterPills({
  label, options, value, onChange,
}: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-gray-500 text-xs">{label}:</span>
      {['', ...options].map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
            value === opt
              ? 'bg-blue-900/50 text-blue-300 border-blue-700/60'
              : 'text-gray-400 border-gray-700/40 hover:border-gray-500/60 hover:text-gray-200'
          }`}
        >
          {opt || 'Todos'}
        </button>
      ))}
    </div>
  );
}

export default function OverviewGrid({ onSelect }: { onSelect: (info: HostInfo) => void }) {
  const [hosts,       setHosts]       = useState<HostInfo[]>([]);
  const [metrics,     setMetrics]     = useState<Map<string, HostMetrics>>(new Map());
  const [loading,     setLoading]     = useState(true);
  const [filterClient, setFilterClient] = useState('');
  const [filterEnv,    setFilterEnv]    = useState('');

  const load = useCallback(async () => {
    try {
      const [hostsData, cpuS, memS, diskS, alerts] = await Promise.all([
        fetchHostsInfo(),
        fetchRawMetric('system_cpu_usage_percent'),
        fetchRawMetric('system_memory_usage_percent'),
        fetchRawMetric('system_disk_usage_percent'),
        fetchAlerts(),
      ]);

      setHosts(hostsData);

      const cpuMap  = toHostMap(cpuS);
      const memMap  = toHostMap(memS);
      const diskMap = toHostMap(diskS);

      const alertsByHost = new Map<string, number>();
      for (const a of alerts) {
        if (a.status === 'firing') alertsByHost.set(a.host, (alertsByHost.get(a.host) ?? 0) + 1);
      }

      const m = new Map<string, HostMetrics>();
      for (const h of hostsData) {
        m.set(h.hostname, {
          cpu:    cpuMap.get(h.hostname)  ?? null,
          mem:    memMap.get(h.hostname)  ?? null,
          disk:   diskMap.get(h.hostname) ?? null,
          alerts: alertsByHost.get(h.hostname) ?? 0,
        });
      }
      setMetrics(m);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Cargando hosts...</div>;
  }
  if (hosts.length === 0) {
    return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Sin hosts registrados</div>;
  }

  const uniqueClients = [...new Set(hosts.map((h) => h.client_name).filter(Boolean) as string[])].sort();
  const uniqueEnvs    = [...new Set(hosts.map((h) => h.env_name).filter(Boolean)    as string[])].sort();

  const visible = hosts.filter((h) => {
    if (filterClient && h.client_name !== filterClient) return false;
    if (filterEnv    && h.env_name    !== filterEnv)    return false;
    return true;
  });

  const online      = hosts.filter((h) => h.status === 'online').length;
  const totalAlerts = Array.from(metrics.values()).reduce((acc, m) => acc + m.alerts, 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{online}</p>
          <p className="text-gray-400 text-xs mt-0.5">Online</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{hosts.length - online}</p>
          <p className="text-gray-400 text-xs mt-0.5">Offline</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${totalAlerts > 0 ? 'text-red-400' : 'text-green-400'}`}>{totalAlerts}</p>
          <p className="text-gray-400 text-xs mt-0.5">Alertas activas</p>
        </div>
      </div>

      {/* Filters */}
      {(uniqueClients.length > 1 || uniqueEnvs.length > 1) && (
        <div className="bg-gray-800/60 rounded-xl px-4 py-3 space-y-2">
          <FilterPills label="Cliente" options={uniqueClients} value={filterClient} onChange={setFilterClient} />
          <FilterPills label="Entorno" options={uniqueEnvs}    value={filterEnv}    onChange={setFilterEnv} />
        </div>
      )}

      {/* Count when filtered */}
      {(filterClient || filterEnv) && (
        <p className="text-gray-500 text-xs">
          Mostrando {visible.length} de {hosts.length} hosts
          {' '}
          <button onClick={() => { setFilterClient(''); setFilterEnv(''); }} className="text-blue-400 hover:text-blue-300 ml-1">
            Limpiar filtros
          </button>
        </p>
      )}

      {/* Host grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visible.map((h) => {
          const m        = metrics.get(h.hostname);
          const isOnline = h.status === 'online';
          const hasAlert = (m?.alerts ?? 0) > 0;
          return (
            <button
              key={h.hostname}
              onClick={() => onSelect(h)}
              className={`text-left bg-gray-800 rounded-xl p-4 border transition-all hover:ring-1 hover:ring-blue-500/40 ${
                hasAlert
                  ? 'border-red-800/60'
                  : isOnline
                  ? 'border-gray-700/40'
                  : 'border-gray-700/20 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[h.status] ?? 'bg-gray-500'}`} />
                    <span className="text-white text-sm font-mono font-medium truncate">{h.hostname}</span>
                  </div>
                  {(h.client_name ?? h.env_name) && (
                    <p className="text-gray-500 text-xs pl-4 truncate">
                      {[h.client_name, h.env_name].filter(Boolean).join(' / ')}
                    </p>
                  )}
                  {h.ip_address && (
                    <p className="text-gray-600 text-xs font-mono pl-4">{h.ip_address}</p>
                  )}
                </div>
                {hasAlert && (
                  <span className="flex-shrink-0 ml-2 text-xs font-semibold bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">
                    ⚠ {m!.alerts}
                  </span>
                )}
              </div>

              {isOnline ? (
                <div className="space-y-2">
                  <GaugeMini label="CPU"  value={m?.cpu  ?? null} color="bg-blue-500" />
                  <GaugeMini label="MEM"  value={m?.mem  ?? null} color="bg-purple-500" />
                  <GaugeMini label="DISK" value={m?.disk ?? null} color="bg-teal-500" />
                </div>
              ) : (
                <p className="text-gray-600 text-xs pl-4 mt-1">
                  Último contacto: {h.last_seen ? String(h.last_seen).slice(0, 16).replace('T', ' ') : '—'}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
