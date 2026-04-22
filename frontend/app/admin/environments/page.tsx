'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  fetchClients, fetchEnvironments, createEnvironment, deleteEnvironment,
  Client, Environment,
} from '../../../lib/api';

const ENV_TYPES = ['production', 'qa', 'dev', 'staging', 'custom'];

export default function EnvironmentsPage() {
  const { data: clients = [] } = useSWR<Client[]>('admin/clients', fetchClients);
  const { data: environments = [], isLoading } = useSWR<Environment[]>('admin/environments', () => fetchEnvironments());

  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('production');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !name.trim()) return;
    setSaving(true); setError('');
    try {
      await createEnvironment(clientId, name.trim(), type);
      setName('');
      await mutate('admin/environments');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este ambiente?')) return;
    try {
      await deleteEnvironment(id);
      await mutate('admin/environments');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name ?? id;
  }

  const typeBadge: Record<string, string> = {
    production: 'bg-red-900/60 text-red-300',
    qa: 'bg-yellow-900/60 text-yellow-300',
    dev: 'bg-green-900/60 text-green-300',
    staging: 'bg-purple-900/60 text-purple-300',
    custom: 'bg-gray-700 text-gray-300',
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Ambientes</h1>

      <form onSubmit={handleCreate} className="bg-gray-900 rounded-lg p-4 mb-6 flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Seleccionar cliente</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del ambiente"
            className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ENV_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            type="submit"
            disabled={saving || !clientId || !name.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors"
          >
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </form>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : environments.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay ambientes registrados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 pr-4">Cliente</th>
              <th className="text-left py-2 pr-4">Nombre</th>
              <th className="text-left py-2 pr-4">Tipo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {environments.map((e) => (
              <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 pr-4 text-gray-300">{clientName(e.client_id)}</td>
                <td className="py-2 pr-4 font-medium">{e.name}</td>
                <td className="py-2 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeBadge[e.type] ?? typeBadge.custom}`}>
                    {e.type}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="text-red-400 hover:text-red-300 text-xs transition-colors"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
