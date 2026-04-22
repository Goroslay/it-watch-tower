'use client';
import useSWR from 'swr';
import { fetchAudit, AuditEntry } from '../../../lib/api';

export default function AuditPage() {
  const { data: audit = [], isLoading } = useSWR<AuditEntry[]>('api/audit', () => fetchAudit(), { refreshInterval: 15000 });

  const successBadge = (s: number) => s === 1
    ? 'text-green-400'
    : 'text-red-400';

  const actionLabel: Record<string, string> = {
    restart_service: 'Reinicio servicio',
    restart_server: 'Reinicio servidor',
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-6">Audit Log</h1>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : audit.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay registros de auditoría.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 pr-3">Fecha</th>
              <th className="text-left py-2 pr-3">Usuario</th>
              <th className="text-left py-2 pr-3">Acción</th>
              <th className="text-left py-2 pr-3">Host</th>
              <th className="text-left py-2 pr-3">Detalle</th>
              <th className="text-left py-2 pr-3">Resultado</th>
              <th className="text-left py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => {
              let params: Record<string, string> = {};
              try { params = JSON.parse(a.params) as Record<string, string>; } catch { /* */ }
              return (
                <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                  </td>
                  <td className="py-2 pr-3 font-medium">{a.username}</td>
                  <td className="py-2 pr-3 text-gray-300">{actionLabel[a.action] ?? a.action}</td>
                  <td className="py-2 pr-3 font-mono text-blue-400 text-xs">{a.target_host}</td>
                  <td className="py-2 pr-3 text-gray-400 text-xs">{params['unit'] || '—'}</td>
                  <td className="py-2 pr-3 text-gray-400 text-xs max-w-xs truncate">{a.result || '—'}</td>
                  <td className={`py-2 text-xs font-medium ${successBadge(a.success)}`}>
                    {a.success === 1 ? 'OK' : 'FAIL'}
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
