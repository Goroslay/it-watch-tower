'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  fetchAdminHosts, fetchClients, fetchEnvironments, assignHost, unassignHost,
  HostEntry, Client, Environment,
} from '../../../lib/api';

export default function HostsPage() {
  const { data: hosts = [], isLoading } = useSWR<HostEntry[]>('admin/hosts', fetchAdminHosts, { refreshInterval: 30000 });
  const { data: clients = [] } = useSWR<Client[]>('admin/clients', fetchClients);
  const { data: environments = [] } = useSWR<Environment[]>('admin/environments', () => fetchEnvironments());

  const [assigningHost, setAssigningHost] = useState<string | null>(null);
  const [selClient, setSelClient] = useState('');
  const [selEnv, setSelEnv] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredEnvs = environments.filter((e) => e.client_id === selClient);

  async function handleAssign() {
    if (!assigningHost || !selClient || !selEnv) return;
    setSaving(true);
    try {
      await assignHost(assigningHost, selClient, selEnv);
      await mutate('admin/hosts');
      setAssigningHost(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnassign(hostname: string) {
    if (!confirm(`¿Desasignar el host "${hostname}"?`)) return;
    try {
      await unassignHost(hostname);
      await mutate('admin/hosts');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function clientName(id: string | null) {
    if (!id) return '—';
    return clients.find((c) => c.id === id)?.name ?? id;
  }

  function envName(id: string | null) {
    if (!id) return '—';
    return environments.find((e) => e.id === id)?.name ?? id;
  }

  const statusColor: Record<string, string> = {
    online: 'text-green-400',
    offline: 'text-red-400',
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-6">Hosts</h1>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : hosts.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay hosts registrados. Instala el agente en un servidor.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 pr-3">Hostname</th>
              <th className="text-left py-2 pr-3">IP</th>
              <th className="text-left py-2 pr-3">Estado</th>
              <th className="text-left py-2 pr-3">Cliente</th>
              <th className="text-left py-2 pr-3">Ambiente</th>
              <th className="text-left py-2 pr-3">Último contacto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((h) => (
              <tr key={h.hostname} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 pr-3 font-mono font-medium">{h.hostname}</td>
                <td className="py-2 pr-3 text-gray-400 font-mono">{h.ip_address || '—'}</td>
                <td className={`py-2 pr-3 text-xs font-medium ${statusColor[h.status] ?? 'text-gray-400'}`}>
                  {h.status}
                </td>
                <td className="py-2 pr-3 text-gray-300">{clientName(h.client_id)}</td>
                <td className="py-2 pr-3 text-gray-300">{envName(h.environment_id)}</td>
                <td className="py-2 pr-3 text-gray-500 text-xs">
                  {new Date(h.last_seen).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                </td>
                <td className="py-2 text-right space-x-3">
                  <button
                    onClick={() => { setAssigningHost(h.hostname); setSelClient(''); setSelEnv(''); }}
                    className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                  >
                    Asignar
                  </button>
                  {h.client_id && (
                    <button
                      onClick={() => handleUnassign(h.hostname)}
                      className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
                    >
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Assignment modal */}
      {assigningHost && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold mb-4">
              Asignar <span className="text-blue-400 font-mono">{assigningHost}</span>
            </h2>
            <div className="flex flex-col gap-3 mb-5">
              <select
                value={selClient}
                onChange={(e) => { setSelClient(e.target.value); setSelEnv(''); }}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Seleccionar cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={selEnv}
                onChange={(e) => setSelEnv(e.target.value)}
                disabled={!selClient}
                className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">Seleccionar ambiente</option>
                {filteredEnvs.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setAssigningHost(null)}
                className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={saving || !selClient || !selEnv}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors"
              >
                {saving ? 'Asignando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
