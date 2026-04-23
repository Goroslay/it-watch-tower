'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  fetchAgentConfig, saveAgentConfig,
  AgentConfig, ServiceEntry, DEFAULT_AGENT_CONFIG,
} from '../../../../../lib/api';

// ── Reusable primitives ────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="border-b border-gray-700 pb-2 mb-4">
      <h2 className="text-white font-semibold">{title}</h2>
      <p className="text-gray-500 text-xs mt-0.5">{sub}</p>
    </div>
  );
}

function StringListEditor({
  label, placeholder, values, onChange,
}: {
  label: string; placeholder: string; values: string[]; onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) { onChange([...values, v]); setDraft(''); }
  };
  return (
    <div>
      <p className="text-gray-400 text-xs mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 bg-gray-700 text-gray-200 text-xs px-2 py-0.5 rounded-full">
            <span className="font-mono">{v}</span>
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="text-gray-400 hover:text-red-400 ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button onClick={add} className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
          + Agregar
        </button>
      </div>
    </div>
  );
}

function ServiceEntryEditor({
  label, entries, onChange, fields,
}: {
  label: string;
  entries: ServiceEntry[];
  onChange: (v: ServiceEntry[]) => void;
  fields: { key: keyof ServiceEntry; label: string; placeholder: string }[];
}) {
  const blank = (): ServiceEntry => ({ name: '', path: '', log_path: '', access_log_path: '' });
  const update = (i: number, key: keyof ServiceEntry, val: string) => {
    const next = entries.map((e, idx) => idx === i ? { ...e, [key]: val } : e);
    onChange(next);
  };
  return (
    <div>
      <div className="space-y-3">
        {entries.map((e, i) => (
          <div key={i} className="bg-gray-900/60 border border-gray-700 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2">
              {fields.map(({ key, label: fl, placeholder }) => (
                <div key={String(key)} className={key === 'name' ? '' : ''}>
                  <p className="text-gray-500 text-xs mb-0.5">{fl}</p>
                  <input
                    value={(e[key] as string) ?? ''}
                    onChange={(ev) => update(i, key, ev.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => onChange(entries.filter((_, idx) => idx !== i))}
              className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              × Eliminar instancia
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...entries, blank()])}
        className="mt-2 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
      >
        + Agregar instancia de {label}
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AgentConfigPage() {
  const params = useParams();
  const router = useRouter();
  const hostname = decodeURIComponent(params.hostname as string);

  const [cfg, setCfg] = useState<AgentConfig>({ ...DEFAULT_AGENT_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    fetchAgentConfig(hostname)
      .then(setCfg)
      .catch(() => setError('No se pudo cargar la configuración'))
      .finally(() => setLoading(false));
  }, [hostname]);

  const set = useCallback(<K extends keyof AgentConfig>(key: K, val: AgentConfig[K]) => {
    setCfg((c) => ({ ...c, [key]: val }));
  }, []);

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveAgentConfig(hostname, cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-gray-500 text-sm p-6">Cargando...</div>;

  const nginxFields: { key: keyof ServiceEntry; label: string; placeholder: string }[] = [
    { key: 'name',            label: 'Nombre',       placeholder: 'main' },
    { key: 'path',            label: 'Proceso/binario', placeholder: '/usr/sbin/nginx' },
    { key: 'log_path',        label: 'Log de errores',  placeholder: '/var/log/nginx/error.log' },
    { key: 'access_log_path', label: 'Access log',      placeholder: '/var/log/nginx/access.log' },
  ];
  const javaFields: { key: keyof ServiceEntry; label: string; placeholder: string }[] = [
    { key: 'name',            label: 'Nombre',         placeholder: 'tomcat01' },
    { key: 'path',            label: 'Ruta base',       placeholder: '/opt/tomcat/tomcat01' },
    { key: 'log_path',        label: 'catalina.out / server.log', placeholder: '/opt/tomcat/tomcat01/logs/catalina.out' },
    { key: 'access_log_path', label: 'Access log (glob)', placeholder: '/opt/tomcat/tomcat01/logs/localhost_access_log*.txt' },
  ];
  const pm2LogFields: { key: keyof ServiceEntry; label: string; placeholder: string }[] = [
    { key: 'name', label: 'Nombre app', placeholder: 'api' },
    { key: 'path', label: 'Ruta log',   placeholder: '/home/deploy/.pm2/logs/api-error.log' },
  ];

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/hosts')} className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Hosts
        </button>
        <span className="text-gray-600">/</span>
        <h1 className="text-lg font-semibold text-white">Configuración agente</h1>
        <span className="text-blue-400 font-mono text-sm bg-blue-900/30 px-2 py-0.5 rounded">{hostname}</span>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/50 text-red-300 text-sm rounded">{error}</div>
      )}

      <div className="space-y-6">

        {/* Discos */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="Discos" sub="Particiones extra a monitorear (uso en %)" />
          <StringListEditor
            label="Rutas de partición"
            placeholder="/DATOS01"
            values={cfg.disk_paths}
            onChange={(v) => set('disk_paths', v)}
          />
        </div>

        {/* Logs genéricos */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="Logs genéricos" sub="Archivos de log a enviar al visor (cualquier servicio)" />
          <StringListEditor
            label="Rutas de log"
            placeholder="/var/log/syslog"
            values={cfg.log_paths}
            onChange={(v) => set('log_paths', v)}
          />
        </div>

        {/* Nginx */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="Nginx" sub="Instancias de Nginx — métricas de proceso, logs y access log" />
          <ServiceEntryEditor
            label="Nginx"
            entries={cfg.nginx}
            onChange={(v) => set('nginx', v)}
            fields={nginxFields}
          />
        </div>

        {/* Tomcat */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="Tomcat" sub="Instancias de Tomcat — proceso, JVM heap, requests, logs" />
          <ServiceEntryEditor
            label="Tomcat"
            entries={cfg.tomcat}
            onChange={(v) => set('tomcat', v)}
            fields={javaFields}
          />
        </div>

        {/* WildFly */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="WildFly" sub="Instancias de WildFly — proceso, JVM heap, requests, logs" />
          <ServiceEntryEditor
            label="WildFly"
            entries={cfg.wildfly}
            onChange={(v) => set('wildfly', v)}
            fields={javaFields}
          />
        </div>

        {/* PM2 */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="PM2" sub="Monitoreo de procesos Node.js gestionados con PM2" />
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={cfg.pm2_enabled} onChange={(e) => set('pm2_enabled', e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500" />
            <span className="text-gray-300 text-sm">Habilitar monitoreo PM2</span>
          </label>
          {cfg.pm2_enabled && (
            <ServiceEntryEditor
              label="log PM2"
              entries={cfg.pm2_logs as ServiceEntry[]}
              onChange={(v) => set('pm2_logs', v.map(({ name, path }) => ({ name, path })))}
              fields={pm2LogFields}
            />
          )}
        </div>

        {/* Oracle */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="Oracle" sub="Monitoreo de base de datos Oracle (sesiones, buffer cache, tablespaces)" />
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={cfg.oracle_enabled} onChange={(e) => set('oracle_enabled', e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500" />
            <span className="text-gray-300 text-sm">Habilitar monitoreo Oracle</span>
          </label>
          {cfg.oracle_enabled && (
            <div>
              <p className="text-gray-400 text-xs mb-1.5">DSN de conexión</p>
              <input
                value={cfg.oracle_dsn}
                onChange={(e) => set('oracle_dsn', e.target.value)}
                placeholder="oracle://monitor:pass@host:1521/ORCL"
                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          )}
        </div>

        {/* Acciones remotas */}
        <div className="bg-gray-800 rounded-xl p-5">
          <SectionHeader title="Acciones remotas" sub="Qué operaciones puede ejecutar el dashboard en este host" />
          <div className="space-y-5">
            <StringListEditor
              label="Servicios systemd (iniciar / reiniciar / detener)"
              placeholder="nginx.service"
              values={cfg.allowed_units}
              onChange={(v) => set('allowed_units', v)}
            />
            <StringListEditor
              label="Procesos PM2 (reiniciar)"
              placeholder="api"
              values={cfg.allowed_pm2_processes}
              onChange={(v) => set('allowed_pm2_processes', v)}
            />
            <StringListEditor
              label="Rutas de log (limpiar/truncar)"
              placeholder="/var/log/app/app.log"
              values={cfg.allowed_log_cleanup_paths}
              onChange={(v) => set('allowed_log_cleanup_paths', v)}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.restart_server_enabled}
                onChange={(e) => set('restart_server_enabled', e.target.checked)}
                className="w-4 h-4 rounded accent-red-500" />
              <span className="text-gray-300 text-sm">Permitir reinicio completo del servidor</span>
            </label>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-4 pb-10">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && <span className="text-green-400 text-sm">✓ Guardado y enviado al agente</span>}
        </div>
      </div>
    </div>
  );
}
