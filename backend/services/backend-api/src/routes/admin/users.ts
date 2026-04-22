import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, generateId } from '../../db';
import { AuthRequest } from '../../middleware/auth';

const router = Router();

router.get('/', (_req: AuthRequest, res: Response): void => {
  const rows = getDb().prepare(`
    SELECT u.id, u.username, u.role, u.client_id, c.name as client_name, u.created_at
    FROM users u LEFT JOIN clients c ON c.id = u.client_id
    ORDER BY u.username
  `).all();
  res.json({ users: rows });
});

router.post('/', (req: AuthRequest, res: Response): void => {
  const { username, password, role = 'viewer', client_id } = req.body as {
    username?: string; password?: string; role?: string; client_id?: string;
  };
  if (!username?.trim() || !password) { res.status(400).json({ error: 'username and password required' }); return; }

  const hash = bcrypt.hashSync(password, 10);
  const id = generateId();
  try {
    getDb().prepare('INSERT INTO users (id, username, password_hash, role, client_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, username.trim(), hash, role, client_id ?? null);
    res.status(201).json({ id, username: username.trim(), role, client_id: client_id ?? null });
  } catch {
    res.status(409).json({ error: 'Username already exists' });
  }
});

router.put('/:id', (req: AuthRequest, res: Response): void => {
  const { password, role, client_id } = req.body as { password?: string; role?: string; client_id?: string | null };
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (password) { sets.push('password_hash = ?'); vals.push(bcrypt.hashSync(password, 10)); }
  if (role) { sets.push('role = ?'); vals.push(role); }
  if ('client_id' in req.body) { sets.push('client_id = ?'); vals.push(client_id ?? null); }
  sets.push("updated_at = datetime('now')");
  vals.push(req.params['id']);
  const info = getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  if (info.changes === 0) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  if (req.user?.userId === req.params['id']) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }
  const info = getDb().prepare('DELETE FROM users WHERE id = ?').run(req.params['id']);
  if (info.changes === 0) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});

router.get('/:id/permissions', (req: AuthRequest, res: Response): void => {
  const rows = getDb().prepare('SELECT * FROM user_permissions WHERE user_id = ?').all(req.params['id']);
  res.json({ permissions: rows });
});

router.post('/:id/permissions', (req: AuthRequest, res: Response): void => {
  const { scope, scope_id, actions } = req.body as { scope?: string; scope_id?: string; actions?: string[] };
  if (!scope || !scope_id || !actions) { res.status(400).json({ error: 'scope, scope_id, actions required' }); return; }
  const id = generateId();
  getDb().prepare(`
    INSERT INTO user_permissions (id, user_id, scope, scope_id, actions)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, scope, scope_id) DO UPDATE SET actions = excluded.actions
  `).run(id, req.params['id'], scope, scope_id, JSON.stringify(actions));
  res.json({ ok: true });
});

export default router;
