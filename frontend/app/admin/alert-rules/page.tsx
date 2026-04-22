'use client';
import { useState, useEffect } from 'react';
import {
  fetchAlertRules, createAlertRule, updateAlertRule, deleteAlertRule,
  type AlertRule,
} from '../../../lib/api';

const OPERATORS = ['gt', 'lt', 'gte', 'lte'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-blue-400',
};

const OP_LABEL: Record<string, string> = { gt: '>', lt: '<', gte: '≥', lte: '≤' };

const EMPTY_FORM = {
  name: '', promql: '', operator: 'gt' as const, threshold: 0,
  severity: 'high' as const, for_count: 1,
  notify_slack: false, notify_email: '',
};

export default function AlertRulesPage() {
  const [rules, setRules]     = useState<AlertRule[]>([]);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError]     = useState('');

  const load = () => fetchAlertRules().then(setRules).catch(() => setError('Error cargando reglas'));

  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError('');
  }

  function openEdit(r: AlertRule) {
    setEditing(r);
    setForm({
      name: r.name, promql: r.promql,
      operator: r.operator as typeof EMPTY_FORM.operator,
      threshold: r.threshold,
      severity: r.severity as typeof EMPTY_FORM.severity,
      for_count: r.for_count,
      notify_slack: r.notify_slack === 1,
      notify_email: r.notify_email,
    });
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...form,
        notify_slack: form.notify_slack ? 1 : 0,
        enabled: 1 as const,
      };
      if (editing) {
        await updateAlertRule(editing.id, body);
      } else {
        await createAlertRule(body);
      }
      setShowForm(false);
      await load();
    } catch {
      setError('Error guardando la regla');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta regla?')) return;
    await deleteAlertRule(id).then(load).catch(() => setError('Error eliminando regla'));
  }

  async function toggleEnabled(r: AlertRule) {
    await updateAlertRule(r.id, { enabled: r.enabled === 1 ? 0 : 1 }).then(load);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Reglas de Alertas</h1>
        <button onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Nueva regla
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Rules table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900/60">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">PromQL</th>
              <th className="text-center px-3 py-3">Condición</th>
              <th className="text-center px-3 py-3">For</th>
              <th className="text-center px-3 py-3">Severidad</th>
              <th className="text-center px-3 py-3">Notif.</th>
              <th className="text-center px-3 py-3">Estado</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={8} className="text-gray-500 text-center py-8">Sin reglas configuradas</td></tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className={`border-t border-gray-700/50 ${r.enabled === 0 ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-white font-medium">{r.name}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs max-w-xs truncate" title={r.promql}>{r.promql}</td>
                <td className="px-3 py-3 text-center text-gray-300 font-mono whitespace-nowrap">
                  {OP_LABEL[r.operator]} {r.threshold}
                </td>
                <td className="px-3 py-3 text-center text-gray-400">{r.for_count}×</td>
                <td className={`px-3 py-3 text-center font-semibold text-xs uppercase ${SEVERITY_COLOR[r.severity]}`}>
                  {r.severity}
                </td>
                <td className="px-3 py-3 text-center text-gray-400 text-xs">
                  {r.notify_slack === 1 && <span className="mr-1">Slack</span>}
                  {r.notify_email && <span>Email</span>}
                  {!r.notify_slack && !r.notify_email && '—'}
                </td>
                <td className="px-3 py-3 text-center">
                  <button onClick={() => void toggleEnabled(r)}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                      r.enabled === 1
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}>
                    {r.enabled === 1 ? 'activa' : 'pausada'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(r)}
                    className="text-blue-400 hover:text-blue-300 text-xs transition-colors">Editar</button>
                  <button onClick={() => void handleDelete(r.id)}
                    className="text-red-400 hover:text-red-300 text-xs transition-colors">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-white font-semibold text-lg mb-5">
              {editing ? 'Editar regla' : 'Nueva regla de alerta'}
            </h2>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Nombre</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required placeholder="high_cpu"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Severidad</label>
                  <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as typeof EMPTY_FORM.severity })}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs block mb-1">PromQL</label>
                <input value={form.promql} onChange={(e) => setForm({ ...form, promql: e.target.value })}
                  required placeholder='system_cpu_usage_percent{host="servidor01"}'
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500" />
                <p className="text-gray-500 text-xs mt-1">Si no se filtra por host la regla aplica a todos los hosts.</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Operador</label>
                  <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value as typeof EMPTY_FORM.operator })}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {OPERATORS.map((o) => <option key={o} value={o}>{OP_LABEL[o]} ({o})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Umbral</label>
                  <input type="number" step="any" value={form.threshold}
                    onChange={(e) => setForm({ ...form, threshold: parseFloat(e.target.value) })}
                    required
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">For (evals)</label>
                  <input type="number" min={1} max={20} value={form.for_count}
                    onChange={(e) => setForm({ ...form, for_count: parseInt(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <p className="text-gray-400 text-xs uppercase tracking-wide">Notificaciones</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.notify_slack}
                    onChange={(e) => setForm({ ...form, notify_slack: e.target.checked })}
                    className="accent-blue-500" />
                  <span className="text-gray-300 text-sm">Slack (requiere SLACK_WEBHOOK_URL configurado)</span>
                </label>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Email(s) — separados por coma</label>
                  <input value={form.notify_email}
                    onChange={(e) => setForm({ ...form, notify_email: e.target.value })}
                    placeholder="ops@empresa.com, oncall@empresa.com"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                  Cancelar
                </button>
                <button type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                  {editing ? 'Guardar cambios' : 'Crear regla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
