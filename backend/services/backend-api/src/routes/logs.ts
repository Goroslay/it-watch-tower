import { Router, Response } from 'express';
import axios from 'axios';
import config from '../config';
import { AuthRequest } from '../middleware/auth';
import { getAllowedHostnames, buildHostInClause } from '../db/helpers';

const router = Router();

async function chQuery<T>(sql: string): Promise<T[]> {
  const url = `${config.clickhouse.url}/?query=${encodeURIComponent(sql + ' FORMAT JSON')}&user=default`;
  const res = await axios.get<{ data: T[] }>(url, { timeout: 10000 });
  return res.data.data;
}

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { host, level, service, search, limit = '50', offset = '0' } = req.query as Record<string, string>;

  const conditions: string[] = [];

  const allowed = getAllowedHostnames(req.user!);
  if (allowed !== null) {
    if (allowed.length === 0) { res.json({ logs: [], total: 0 }); return; }
    conditions.push(`host IN ${buildHostInClause(allowed)}`);
  }
  if (host)    conditions.push(`host = '${host.replace(/'/g, '')}'`);
  if (level)   conditions.push(`log_level = '${level.replace(/'/g, '')}'`);
  if (service) conditions.push(`service = '${service.replace(/'/g, '')}'`);
  if (search)  conditions.push(`message ILIKE '%${search.replace(/'/g, '').replace(/%/g, '')}%'`);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT timestamp, host, service, log_level, message, metadata
    FROM ${config.clickhouse.db}.logs ${where}
    ORDER BY timestamp DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  try {
    const rows = await chQuery(sql);
    res.json({ logs: rows, total: rows.length });
  } catch (err) {
    res.status(502).json({ error: 'Failed to query logs', detail: (err as Error).message });
  }
});

export default router;
