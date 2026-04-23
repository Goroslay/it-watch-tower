'use client';
import { useEffect, useState, useCallback } from 'react';
import { fetchRawMetric, fetchAlerts, fetchHostsInfo, type HostInfo } from '../../lib/api';
import { GaugeMini } from './OverviewGrid';

interface HostMetrics {
  cpu:    number | null;
  mem:    number | null;
  alerts: number;
}

function toHostMap(series: { metric: Record<string, string>; value: number }[]): Map<string, number> {
  return new Map(series.map((s) => [s.metric['host'] ?? '', s.value]));
}

export default function StatusBar({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (info: HostInfo) => void;
}) {
  const [hosts,   setHosts]   = useState<HostInfo[]>([]);
  const [metrics, setMetrics] = useState<Map<string, HostMetrics>>(new Map());
  const [open,    setOpen]    = useState(false);

  const load = useCallback(async () => {
    try {
      const [hostsData, cpuS, memS, alerts] = await Promise.all([
        fetchHostsInfo(),
        fetchRawMetric('system_cpu_usage_percent'),
        fetchRawMetric('system_memory_usage_percent'),
        fetchAlerts(),
      ]);
      setHosts(hostsData);

      const cpuMap = toHostMap(cpuS);
      const memMap = toHostMap(memS);

      const alertsByHost = new Map<string, number>();
      for (const a of alerts) {
        if (a.status === 'firing') alertsByHost.set(a.host, (alertsByHost.get(a.host) ?? 0) + 1);
      }

      const m = new Map<string, HostMetrics>();
      for (const h of hostsData) {
        m.set(h.hostname, {
          cpu:    cpuMap.get(h.hostname) ?? null,
          mem:    memMap.get(h.hostname) ?? null,
          alerts: alertsByHost.get(h.hostname) ?? 0,
        });
      }
      setMetrics(m);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  // No vale la pena mostrar la barra si solo hay un host
  if (hosts.length <= 1) return null;

  const firingHosts = Array.from(metrics.entries()).filter(([, m]) => m.alerts > 0).length;

  return (
    <div className="bg-gray-900 border-b border-gray-800 flex-shrink-0">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <span className="text-gray-600">{open ? '▾' : '▸'}</span>
        <span className="font-medium text-gray-400">Todos los hosts</span>
        <span className="text-gray-600">({hosts.length})</span>
        {firingHosts > 0 && (
          <span className="text-red-400 font-semibold ml-1">⚠ {firingHosts} con alertas</span>
        )}
        <span className="ml-auto text-gray-600">{open ? 'Ocultar' : 'Mostrar'}</span>
      </button>

      {/* Compact host chips — horizontal scroll */}
      {open && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 pt-1">
          {hosts.map((h) => {
            const m          = metrics.get(h.hostname);
            const isSelected = h.hostname === selected;
            const hasAlert   = (m?.alerts ?? 0) > 0;
            const isOnline   = h.status === 'online';
            return (
              <button
                key={h.hostname}
                onClick={() => onSelect(h)}
                className={`flex-shrink-0 rounded-lg px-3 py-2 border transition-colors text-left w-36 ${
                  isSelected
                    ? 'bg-blue-900/40 border-blue-600/60'
                    : hasAlert
                    ? 'bg-red-900/20 border-red-800/50 hover:border-red-700/70'
                    : 'bg-gray-800 border-gray-700/40 hover:border-gray-600/60'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className={`text-xs font-mono font-medium truncate flex-1 ${isSelected ? 'text-blue-300' : 'text-gray-200'}`}>
                    {h.hostname}
                  </span>
                  {hasAlert && <span className="text-red-400 text-xs flex-shrink-0">⚠</span>}
                </div>
                {isOnline ? (
                  <div className="space-y-1">
                    <GaugeMini label="CPU" value={m?.cpu ?? null} color="bg-blue-500" />
                    <GaugeMini label="MEM" value={m?.mem ?? null} color="bg-purple-500" />
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">offline</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
