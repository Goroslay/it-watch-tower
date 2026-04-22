'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { fetchClients, createClient, deleteClient, Client } from '../../../lib/api';

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useSWR<Client[]>('admin/clients', fetchClients);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createClient(name.trim(), desc.trim());
      setName(''); setDesc('');
      await mutate('admin/clients');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, clientName: string) {
    if (!confirm(`¿Eliminar cliente "${clientName}"? Se borrarán sus ambientes y se desasignarán sus hosts.`)) return;
    try {
      await deleteClient(id);
      await mutate('admin/clients');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-6">Clientes</h1>

      <form onSubmit={handleCreate} className="bg-gray-900 rounded-lg p-4 mb-6 flex flex-col gap-3">
        <div className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del cliente"
            className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Descripción (opcional)"
            className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors"
          >
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </form>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : clients.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay clientes registrados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 pr-4">Nombre</th>
              <th className="text-left py-2 pr-4">Descripción</th>
              <th className="text-left py-2 pr-4">Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 pr-4 font-medium">{c.name}</td>
                <td className="py-2 pr-4 text-gray-400">{c.description || '—'}</td>
                <td className="py-2 pr-4 text-gray-500">{new Date(c.created_at).toLocaleDateString('es-CO')}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
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
