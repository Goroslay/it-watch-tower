import { Router, Response } from 'express';
import { getDb, generateId } from '../../db';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

router.get('/', (_req: AuthRequest, res: Response): void => {
  const rows = getDb().prepare(`
    SELECT c.id, c.name, c.description, c.created_at,
           COUNT(e.id) as environment_count
    FROM clients c
    LEFT JOIN environments e ON e.client_id = c.id
    GROUP BY c.id ORDER BY c.name
  `).all();
  res.json({ clients: rows });
});

router.post('/', (req: AuthRequest, res: Response): void => {
  const { name, description = '' } = req.body as { name?: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
  const id = generateId();
  try {
    getDb().prepare('INSERT INTO clients (id, name, description) VALUES (?, ?, ?)').run(id, name.trim(), description);
    res.status(201).json({ id, name: name.trim(), description });
  } catch {
    res.status(409).json({ error: 'Client name already exists' });
  }
});

router.put('/:id', (req: AuthRequest, res: Response): void => {
  const { name, description } = req.body as { name?: string; description?: string };
  const { id } = req.params;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (name) { sets.push('name = ?'); vals.push(name.trim()); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }
  vals.push(id);
  const info = getDb().prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  if (info.changes === 0) { res.status(404).json({ error: 'Client not found' }); return; }
  res.json({ ok: true });
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const info = getDb().prepare('DELETE FROM clients WHERE id = ?').run(req.params['id']);
  if (info.changes === 0) { res.status(404).json({ error: 'Client not found' }); return; }
  res.json({ ok: true });
});

export default router;
