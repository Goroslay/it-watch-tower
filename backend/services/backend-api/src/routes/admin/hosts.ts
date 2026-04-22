import { Router, Response } from 'express';
import { getDb } from '../../db';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

router.get('/', (_req: AuthRequest, res: Response): void => {
  const rows = getDb().prepare(`
    SELECT h.*, c.name as client_name, e.name as environment_name, e.type as environment_type
    FROM host_registry h
    LEFT JOIN clients c ON c.id = h.client_id
    LEFT JOIN environments e ON e.id = h.environment_id
    ORDER BY h.hostname
  `).all();
  res.json({ hosts: rows });
});

router.get('/unassigned', (_req: AuthRequest, res: Response): void => {
  const rows = getDb().prepare(`
    SELECT * FROM host_registry
    WHERE client_id IS NULL
    ORDER BY last_seen DESC
  `).all();
  res.json({ hosts: rows });
});

router.post('/:hostname/assign', (req: AuthRequest, res: Response): void => {
  const { client_id, environment_id } = req.body as { client_id?: string; environment_id?: string };
  if (!client_id || !environment_id) {
    res.status(400).json({ error: 'client_id and environment_id required' });
    return;
  }

  const env = getDb().prepare('SELECT id FROM environments WHERE id = ? AND client_id = ?').get(environment_id, client_id);
  if (!env) { res.status(400).json({ error: 'Environment does not belong to client' }); return; }

  const info = getDb().prepare(`
    UPDATE host_registry
    SET client_id = ?, environment_id = ?, assigned_by = ?, assigned_at = datetime('now')
    WHERE hostname = ?
  `).run(client_id, environment_id, req.user!.username, req.params['hostname']);

  if (info.changes === 0) { res.status(404).json({ error: 'Host not found' }); return; }
  res.json({ ok: true });
});

router.delete('/:hostname/assign', (req: AuthRequest, res: Response): void => {
  const info = getDb().prepare(`
    UPDATE host_registry
    SET client_id = NULL, environment_id = NULL, assigned_by = '', assigned_at = ''
    WHERE hostname = ?
  `).run(req.params['hostname']);
  if (info.changes === 0) { res.status(404).json({ error: 'Host not found' }); return; }
  res.json({ ok: true });
});

export default router;
