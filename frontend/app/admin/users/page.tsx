'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { fetchUsers, fetchClients, createUser, deleteUser, User, Client } from '../../../lib/api';

const ROLES = ['admin', 'operator', 'viewer'];

export default function UsersPage() {
  const { data: users = [], isLoading } = useSWR<User[]>('admin/users', fetchUsers);
  const { data: clients = [] } = useSWR<Client[]>('admin/clients', fetchClients);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setSaving(true); setError('');
    try {
      await createUser(username.trim(), password.trim(), role, clientId || undefined);
      setUsername(''); setPassword(''); setClientId('');
      await mutate('admin/users');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, uname: string) {
    if (!confirm(`¿Eliminar usuario "${uname}"?`)) return;
    try {
      await deleteUser(id);
      await mutate('admin/users');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function clientName(id: string | null) {
    if (!id) return '— (admin global)';
    return clients.find((c) => c.id === id)?.name ?? id;
  }

  const roleBadge: Record<string, string> = {
    admin: 'bg-red-900/60 text-red-300',
    operator: 'bg-yellow-900/60 text-yellow-300',
    viewer: 'bg-gray-700 text-gray-300',
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-6">Usuarios</h1>

      <form onSubmit={handleCreate} className="bg-gray-900 rounded-lg p-4 mb-6 flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="bg-gray-800 text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Sin cliente (admin global)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            type="submit"
            disabled={saving || !username.trim() || !password.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors"
          >
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </form>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 pr-4">Usuario</th>
              <th className="text-left py-2 pr-4">Rol</th>
              <th className="text-left py-2 pr-4">Cliente</th>
              <th className="text-left py-2 pr-4">Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                <td className="py-2 pr-4 font-medium">{u.username}</td>
                <td className="py-2 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge[u.role] ?? roleBadge.viewer}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-400">{clientName(u.client_id)}</td>
                <td className="py-2 pr-4 text-gray-500">{new Date(u.created_at).toLocaleDateString('es-CO')}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => handleDelete(u.id, u.username)}
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
