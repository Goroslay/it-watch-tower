import { getDb } from './index';
import { TokenPayload } from '../middleware/auth';

interface HostRow { hostname: string }

export function getAllowedHostnames(user: TokenPayload): string[] | null {
  if (user.role === 'admin') return null; // null = no filter

  const db = getDb();
  if (user.client_id) {
    const rows = db
      .prepare('SELECT hostname FROM host_registry WHERE client_id = ?')
      .all(user.client_id) as HostRow[];
    return rows.map((r) => r.hostname);
  }
  return [];
}

export function buildHostInClause(hostnames: string[]): string {
  if (hostnames.length === 0) return '()';
  return `(${hostnames.map((h) => `'${h.replace(/'/g, '')}'`).join(',')})`;
}
