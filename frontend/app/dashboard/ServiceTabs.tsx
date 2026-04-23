'use client';
import { useState, useEffect } from 'react';
import { fetchRawMetric, RawSeries } from '../../lib/api';

type Tab = 'sistema' | 'nginx' | 'pm2' | 'tomcat' | 'wildfly' | 'oracle';

const TABS: { key: Tab; label: string }[] = [
  { key: 'sistema', label: 'Sistema Extra' },
  { key: 'nginx',   label: 'Nginx' },
  { key: 'pm2',     label: 'PM2' },
  { key: 'tomcat',  label: 'Tomcat' },
  { key: 'wildfly', label: 'WildFly' },
  { key: 'oracle',  label: 'Oracle' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function bytes(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + ' GB';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' MB';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + ' KB';
  return v.toFixed(0) + ' B';
}

function pct(v: number): string { return v.toFixed(1) + '%'; }

function NoData() {
  return <p className="text-gray-500 text-sm py-4">Sin datos disponibles para este host.</p>;
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-white text-lg font-semibold">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function HeapBar({ instance, used, capacity }: { instance: string; used: number; capacity: number }) {
  const usedPct = capacity > 0 ? Math.min(used / capacity * 100, 100) : 0;
  const color = usedPct > 90 ? 'bg-red-500' : usedPct > 75 ? 'bg-yellow-500' : 'bg-blue-500';
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-blue-400 font-mono">{instance}</span>
        <span className="text-gray-400">{bytes(used)} / {bytes(capacity)} ({pct(usedPct)})</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}

// Groups series by label value
function groupBy(series: RawSeries[], label: string): Record<string, number> {
  const result: Record<string, number> = {};
  series.forEach((s) => { result[s.metric[label] ?? 'default'] = s.value; });
  return result;
}

// ── Tab content ────────────────────────────────────────────────────────────────

function SistemaTab({ host }: { host: string }) {
  const h = `{host="${host}"}`;
  const [d, setD] = useState<Record<string, RawSeries[]>>({});

  useEffect(() => {
    Promise.all([
      fetchRawMetric(`system_load_avg_1m${h}`),
      fetchRawMetric(`system_load_avg_5m${h}`),
      fetchRawMetric(`system_load_avg_15m${h}`),
      fetchRawMetric(`system_open_file_descriptors${h}`),
      fetchRawMetric(`system_max_file_descriptors${h}`),
      fetchRawMetric(`rate(system_disk_read_bytes_total${h}[2m])`),
      fetchRawMetric(`rate(system_disk_write_bytes_total${h}[2m])`),
    ]).then(([l1, l5, l15, fdO, fdM, dR, dW]) =>
      setD({ l1, l5, l15, fdO, fdM, dR, dW })
    ).catch(() => undefined);
  }, [host]);

  const v = (k: string) => d[k]?.[0]?.value ?? null;
  if (!d['l1']) return <p className="text-gray-500 text-sm py-4">Cargando...</p>;
  if (v('l1') === null && v('fdO') === null && !d['dR']?.length) return <NoData />;

  const diskMap: Record<string, { read: number; write: number }> = {};
  (d['dR'] ?? []).forEach((s) => { const n = s.metric['disk'] ?? '?'; diskMap[n] = { read: s.value, write: 0 }; });
  (d['dW'] ?? []).forEach((s) => { const n = s.metric['disk'] ?? '?'; diskMap[n] = { ...(diskMap[n] ?? { read: 0 }), write: s.value }; });

  return (
    <div className="space-y-5">
      {v('l1') !== null && (
        <div>
          <p className="text-gray-400 text-xs mb-3 uppercase tracking-wide">Load average</p>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="1 min"  value={(v('l1') ?? 0).toFixed(2)} />
            <MiniStat label="5 min"  value={(v('l5') ?? 0).toFixed(2)} />
            <MiniStat label="15 min" value={(v('l15') ?? 0).toFixed(2)} />
          </div>
        </div>
      )}
      {v('fdO') !== null && v('fdM') !== null && (
        <div>
          <p className="text-gray-400 text-xs mb-2 uppercase tracking-wide">File descriptors</p>
          <HeapBar instance="abiertos" used={v('fdO') ?? 0} capacity={v('fdM') ?? 0} />
        </div>
      )}
      {Object.keys(diskMap).length > 0 && (
        <div>
          <p className="text-gray-400 text-xs mb-3 uppercase tracking-wide">Disk I/O</p>
          {(() => {
            const entries = Object.entries(diskMap);
            const maxVal = Math.max(...entries.flatMap(([, io]) => [io.read, io.write]), 1);
            return (
              <div className="space-y-4">
                {entries.map(([diskName, io]) => (
                  <div key={diskName}>
                    <p className="text-gray-400 font-mono text-xs mb-1.5">{diskName}</p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-600 text-xs w-16 flex-shrink-0">Lectura</span>
                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.min(io.read / maxVal * 100, 100)}%` }} />
                      </div>
                      <span className="text-blue-400 text-xs w-20 text-right font-mono flex-shrink-0">{bytes(io.read)}/s</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 text-xs w-16 flex-shrink-0">Escritura</span>
                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.min(io.write / maxVal * 100, 100)}%` }} />
                      </div>
                      <span className="text-purple-400 text-xs w-20 text-right font-mono flex-shrink-0">{bytes(io.write)}/s</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function NginxTab({ host }: { host: string }) {
  const h = `{host="${host}"}`;
  const [d, setD] = useState<Record<string, RawSeries[]>>({});

  useEffect(() => {
    Promise.all([
      fetchRawMetric(`nginx_process_cpu_percent${h}`),
      fetchRawMetric(`nginx_process_rss_bytes${h}`),
      fetchRawMetric(`nginx_process_threads${h}`),
      fetchRawMetric(`nginx_active_connections${h}`),
      fetchRawMetric(`increase(nginx_requests_total${h}[2m])`),
      fetchRawMetric(`increase(nginx_errors_total${h}[2m])`),
      fetchRawMetric(`nginx_error_rate_pct${h}`),
    ]).then(([cpu, mem, thr, conn, req, err, errpct]) =>
      setD({ cpu, mem, thr, conn, req, err, errpct })
    ).catch(() => undefined);
  }, [host]);

  const hasData = Object.values(d).some((v) => v.length > 0);
  if (!hasData) return <NoData />;

  const instances = Array.from(new Set(
    Object.values(d).flatMap((s) => s.map((r) => r.metric['instance'] ?? 'default'))
  ));

  return (
    <table className="w-full text-sm">
      <thead><tr className="text-gray-400 border-b border-gray-700 text-xs">
        <th className="text-left py-1 pr-3">Instancia</th>
        <th className="text-right py-1 pr-3">CPU %</th>
        <th className="text-right py-1 pr-3">RSS</th>
        <th className="text-right py-1 pr-3">Hilos</th>
        <th className="text-right py-1 pr-3">Conexiones</th>
        <th className="text-right py-1 pr-3">Req/2min</th>
        <th className="text-right py-1">Err %</th>
      </tr></thead>
      <tbody>
        {instances.map((inst) => {
          const g = (k: string) => d[k]?.find((s) => (s.metric['instance'] ?? 'default') === inst)?.value;
          const errRate = g('errpct') ?? 0;
          return (
            <tr key={inst} className="border-b border-gray-700/40">
              <td className="py-1.5 pr-3 font-mono text-blue-400 font-medium">{inst}</td>
              <td className="py-1.5 pr-3 text-right">{g('cpu') !== undefined ? pct(g('cpu')!) : '—'}</td>
              <td className="py-1.5 pr-3 text-right text-purple-400">{g('mem') !== undefined ? bytes(g('mem')!) : '—'}</td>
              <td className="py-1.5 pr-3 text-right text-gray-300">{g('thr') ?? '—'}</td>
              <td className="py-1.5 pr-3 text-right text-cyan-400">{g('conn') ?? '—'}</td>
              <td className="py-1.5 pr-3 text-right text-gray-300">{g('req') !== undefined ? Math.round(g('req')!) : '—'}</td>
              <td className={`py-1.5 text-right font-medium ${errRate > 5 ? 'text-red-400' : errRate > 1 ? 'text-yellow-400' : 'text-green-400'}`}>
                {g('errpct') !== undefined ? pct(errRate) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PM2Tab({ host }: { host: string }) {
  const h = `{host="${host}"}`;
  const [procs, setProcs] = useState<Record<string, { up: number; cpu: number; mem: number; restarts: number }>>({});

  useEffect(() => {
    Promise.all([
      fetchRawMetric(`pm2_process_up${h}`),
      fetchRawMetric(`pm2_process_cpu_percent${h}`),
      fetchRawMetric(`pm2_process_memory_bytes${h}`),
      fetchRawMetric(`pm2_process_restarts${h}`),
    ]).then(([ups, cpus, mems, rsts]) => {
      const map: Record<string, { up: number; cpu: number; mem: number; restarts: number }> = {};
      const key = (s: RawSeries) => `${s.metric['name'] ?? '?'}#${s.metric['pm_id'] ?? '0'}`;
      ups.forEach((s)  => { map[key(s)] = { up: s.value, cpu: 0, mem: 0, restarts: 0 }; });
      cpus.forEach((s) => { if (map[key(s)]) map[key(s)].cpu = s.value; });
      mems.forEach((s) => { if (map[key(s)]) map[key(s)].mem = s.value; });
      rsts.forEach((s) => { if (map[key(s)]) map[key(s)].restarts = s.value; });
      setProcs(map);
    }).catch(() => undefined);
  }, [host]);

  if (!Object.keys(procs).length) return <NoData />;

  return (
    <table className="w-full text-sm">
      <thead><tr className="text-gray-400 border-b border-gray-700">
        <th className="text-left py-1 pr-4">Proceso</th>
        <th className="text-left py-1 pr-4">Estado</th>
        <th className="text-right py-1 pr-4">CPU</th>
        <th className="text-right py-1 pr-4">Memoria</th>
        <th className="text-right py-1">Reinicios</th>
      </tr></thead>
      <tbody>
        {Object.entries(procs).map(([k, p]) => {
          const name = k.split('#')[0];
          return (
            <tr key={k} className="border-b border-gray-700/40">
              <td className="py-1.5 pr-4 font-mono font-medium">{name}</td>
              <td className="py-1.5 pr-4">
                <span className={`text-xs font-semibold ${p.up === 1 ? 'text-green-400' : 'text-red-400'}`}>
                  {p.up === 1 ? 'online' : 'stopped'}
                </span>
              </td>
              <td className="py-1.5 pr-4 text-right text-blue-400">{pct(p.cpu)}</td>
              <td className="py-1.5 pr-4 text-right text-purple-400">{bytes(p.mem)}</td>
              <td className="py-1.5 text-right text-gray-400">{p.restarts}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Shared multi-instance JVM tab for Tomcat and WildFly
function JavaAppTab({ host, service }: { host: string; service: 'tomcat' | 'wildfly' }) {
  const h = `{host="${host}"}`;
  const [d, setD] = useState<Record<string, RawSeries[]>>({});

  useEffect(() => {
    const p = service;
    Promise.all([
      fetchRawMetric(`${p}_heap_used_bytes${h}`),
      fetchRawMetric(`${p}_heap_capacity_bytes${h}`),
      fetchRawMetric(`${p}_process_cpu_percent${h}`),
      fetchRawMetric(`${p}_process_threads${h}`),
      fetchRawMetric(`${p}_active_connections${h}`),
      fetchRawMetric(`${p}_young_gc_total${h}`),
      fetchRawMetric(`${p}_full_gc_total${h}`),
      fetchRawMetric(`increase(${p}_requests_total${h}[2m])`),
      fetchRawMetric(`${p}_error_rate_pct${h}`),
    ]).then(([hu, hc, cpu, thr, conn, yg, fg, req, errpct]) =>
      setD({ hu, hc, cpu, thr, conn, yg, fg, req, errpct })
    ).catch(() => undefined);
  }, [host, service]);

  if (!Object.values(d).some((v) => v.length > 0)) return <NoData />;

  const instances = Array.from(new Set(
    Object.values(d).flatMap((s) => s.map((r) => r.metric['instance'] ?? 'default')).filter(Boolean)
  ));

  const byInst = (k: string) => groupBy(d[k] ?? [], 'instance');
  const hu = byInst('hu');
  const hc = byInst('hc');
  const cp = byInst('cpu');
  const thr = byInst('thr');
  const conn = byInst('conn');
  const yg = byInst('yg');
  const fg = byInst('fg');
  const req = byInst('req');
  const errpct = byInst('errpct');

  return (
    <div className="space-y-5">
      {Object.keys(hu).length > 0 && (
        <div>
          <p className="text-gray-400 text-xs mb-2 uppercase tracking-wide">JVM Heap (vía jstat)</p>
          {instances.filter((i) => hu[i] !== undefined).map((inst) => (
            <HeapBar key={inst} instance={inst} used={hu[inst] ?? 0} capacity={hc[inst] ?? 0} />
          ))}
        </div>
      )}
      {instances.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 border-b border-gray-700 text-xs">
            <th className="text-left py-1 pr-3">Instancia</th>
            <th className="text-right py-1 pr-3">CPU %</th>
            <th className="text-right py-1 pr-3">Hilos</th>
            <th className="text-right py-1 pr-3">Conexiones</th>
            <th className="text-right py-1 pr-3">Young GC</th>
            <th className="text-right py-1 pr-3">Full GC</th>
            <th className="text-right py-1 pr-3">Req/2min</th>
            <th className="text-right py-1">Err %</th>
          </tr></thead>
          <tbody>
            {instances.map((inst) => {
              const errRate = errpct[inst] ?? 0;
              return (
                <tr key={inst} className="border-b border-gray-700/40">
                  <td className="py-1.5 pr-3 font-mono text-blue-400 font-medium">{inst}</td>
                  <td className="py-1.5 pr-3 text-right">{cp[inst] !== undefined ? pct(cp[inst]) : '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-300">{thr[inst] ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-cyan-400">{conn[inst] ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-300">{yg[inst] ?? '—'}</td>
                  <td className={`py-1.5 pr-3 text-right ${(fg[inst] ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {fg[inst] ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-gray-300">
                    {req[inst] !== undefined ? Math.round(req[inst]) : '—'}
                  </td>
                  <td className={`py-1.5 text-right font-medium ${errRate > 5 ? 'text-red-400' : errRate > 1 ? 'text-yellow-400' : errpct[inst] !== undefined ? 'text-green-400' : 'text-gray-500'}`}>
                    {errpct[inst] !== undefined ? pct(errRate) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OracleTab({ host }: { host: string }) {
  const h = `{host="${host}"}`;
  const [active,   setActive]     = useState<number | null>(null);
  const [total,    setTotal]      = useState<number | null>(null);
  const [hitRatio, setHitRatio]   = useState<number | null>(null);
  const [ts,       setTs]         = useState<RawSeries[]>([]);

  useEffect(() => {
    Promise.all([
      fetchRawMetric(`oracle_active_sessions${h}`),
      fetchRawMetric(`oracle_total_sessions${h}`),
      fetchRawMetric(`oracle_buffer_cache_hit_ratio${h}`),
      fetchRawMetric(`oracle_tablespace_used_pct${h}`),
    ]).then(([a, t, hr, tsData]) => {
      if (a[0]) setActive(a[0].value);
      if (t[0]) setTotal(t[0].value);
      if (hr[0]) setHitRatio(hr[0].value);
      setTs(tsData);
    }).catch(() => undefined);
  }, [host]);

  if (active === null && hitRatio === null && !ts.length) return <NoData />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {active   !== null && <MiniStat label="Sesiones activas" value={String(active)} />}
        {total    !== null && <MiniStat label="Sesiones totales" value={String(total)} />}
        {hitRatio !== null && (
          <MiniStat
            label="Buffer cache hit"
            value={pct(hitRatio)}
            sub={hitRatio >= 95 ? '✓ OK' : hitRatio >= 85 ? '⚠ Revisar' : '✗ Crítico'}
          />
        )}
      </div>
      {ts.length > 0 && (
        <div>
          <p className="text-gray-400 text-xs mb-2 uppercase tracking-wide">Tablespaces</p>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left py-1 pr-4">Tablespace</th>
              <th className="text-right py-1">Uso</th>
            </tr></thead>
            <tbody>
              {ts.map((s) => {
                const v = s.value;
                const c = v > 90 ? 'text-red-400' : v > 75 ? 'text-yellow-400' : 'text-green-400';
                return (
                  <tr key={s.metric['tablespace']} className="border-b border-gray-700/40">
                    <td className="py-1.5 pr-4 font-mono text-gray-300">{s.metric['tablespace']}</td>
                    <td className={`py-1.5 text-right font-medium ${c}`}>{pct(v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ServiceTabs({ host }: { host: string }) {
  const [active, setActive] = useState<Tab>('sistema');

  useEffect(() => { setActive('sistema'); }, [host]);

  const tabContent: Record<Tab, React.ReactNode> = {
    sistema: <SistemaTab  host={host} />,
    nginx:   <NginxTab    host={host} />,
    pm2:     <PM2Tab      host={host} />,
    tomcat:  <JavaAppTab  host={host} service="tomcat" />,
    wildfly: <JavaAppTab  host={host} service="wildfly" />,
    oracle:  <OracleTab   host={host} />,
  };

  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <h2 className="text-white font-semibold mb-4">
        Servicios — <span className="text-blue-400 font-mono text-sm">{host}</span>
      </h2>
      <div className="flex gap-1 mb-5 border-b border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1.5 text-sm rounded-t transition-colors ${
              active === t.key
                ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-900/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-[80px]">{tabContent[active]}</div>
    </div>
  );
}
