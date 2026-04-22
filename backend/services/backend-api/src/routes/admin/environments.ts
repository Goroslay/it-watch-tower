import { Router, Response } from 'express';
import { getDb, generateId } from '../../db';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

router.get('/', (req: AuthRequest, res: Response): void => {
  const { client_id } = req.query as Record<string, string>;
  const sql = client_id
    ? 'SELECT e.*, COUNT(h.hostname) as server_count FROM environments e LEFT JOIN host_registry h ON h.environment_id = e.id WHERE e.client_id = ? GROUP BY e.id ORDER BY e.name'
    : 'SELECT e.*, COUNT(h.hostname) as server_count FROM environments e LEFT JOIN host_registry h ON h.environment_id = e.id GROUP BY e.id ORDER BY e.name';
  const rows = client_id
    ? getDb().prepare(sql).all(client_id)
    : getDb().prepare(sql).all();
  res.json({ environments: rows });
});

router.post('/', (req: AuthRequest, res: Response): void => {
  const { client_id, name, type = 'custom' } = req.body as { client_id?: string; name?: string; type?: string };
  if (!client_id || !name?.trim()) { res.status(400).json({ error: 'client_id and name required' }); return; }
  const id = generateId();
  try {
    getDb().prepare('INSERT INTO environments (id, client_id, name, type) VALUES (?, ?, ?, ?)').run(id, client_id, name.trim(), type);
    res.status(201).json({ id, client_id, name: name.trim(), type });
  } catch {
    res.status(409).json({ error: 'Environment already exists for this client' });
  }
});

router.put('/:id', (req: AuthRequest, res: Response): void => {
  const { name, type } = req.body as { name?: string; type?: string };
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (name) { sets.push('name = ?'); vals.push(name.trim()); }
  if (type) { sets.push('type = ?'); vals.push(type); }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }
  vals.push(req.params['id']);
  const info = getDb().prepare(`UPDATE environments SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  if (info.changes === 0) { res.status(404).json({ error: 'Environment not found' }); return; }
  res.json({ ok: true });
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const info = getDb().prepare('DELETE FROM environments WHERE id = ?').run(req.params['id']);
  if (info.changes === 0) { res.status(404).json({ error: 'Environment not found' }); return; }
  res.json({ ok: true });
});

export default router;
