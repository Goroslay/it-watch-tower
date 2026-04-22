import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb, generateId } from '../db';
import { AuthRequest } from '../middleware/auth';
import { getNats } from '../services/natsSubscriber';

const router = Router();

interface ActionResult {
  id: string;
  success: boolean;
  message: string;
  executed_at: number;
}

interface HostRow {
  client_id: string | null;
  allowed_units: string;
  restart_server_enabled: number;
}

function sanitizeSubject(v: string): string {
  return v.replace(/[. /\\:]/g, '-');
}

// GET /api/actions/services/:hostname  — returns allowed units + restart flag for this host
router.get('/services/:hostname', (req: AuthRequest, res: Response): void => {
  const { hostname } = req.params;
  const host = getDb().prepare(
    'SELECT client_id, allowed_units, restart_server_enabled FROM host_registry WHERE hostname = ?'
  ).get(hostname) as HostRow | undefined;

  if (!host) { res.status(404).json({ error: 'Host not found' }); return; }

  const user = req.user!;
  if (user.role !== 'admin' && user.client_id !== host.client_id) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  let units: string[] = [];
  try { units = JSON.parse(host.allowed_units) as string[]; } catch { /* empty */ }

  res.json({ units, restart_server_enabled: host.restart_server_enabled === 1 });
});

// POST /api/actions  — execute action on a host via NATS request/reply
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { hostname, action, unit } = req.body as { hostname?: string; action?: string; unit?: string };
  if (!hostname || !action) {
    res.status(400).json({ error: 'hostname and action required' });
    return;
  }

  const user = req.user!;

  // viewers cannot execute actions
  if (user.role === 'viewer') {
    res.status(403).json({ error: 'Viewers cannot execute actions' });
    return;
  }

  // restart_server: admin only
  if (action === 'restart_server' && user.role !== 'admin') {
    res.status(403).json({ error: 'Only admins can restart servers' });
    return;
  }

  // operators can only act on hosts in their client
  if (user.role === 'operator') {
    const host = getDb().prepare('SELECT client_id FROM host_registry WHERE hostname = ?').get(hostname) as { client_id: string | null } | undefined;
    if (!host || host.client_id !== user.client_id) {
      res.status(403).json({ error: 'Host not in your client' });
      return;
    }
  }

  const nats = getNats();
  if (!nats || !nats.isConnected()) {
    res.status(503).json({ error: 'NATS not available' });
    return;
  }

  const actionId = randomUUID();
  const subject = 'actions.' + sanitizeSubject(hostname);

  let result: ActionResult;
  try {
    const reply = await nats.request(subject, { id: actionId, action, unit: unit ?? '', requested_by: user.username }, 30000);
    result = nats.decodeMsg(reply) as ActionResult;
  } catch (err) {
    const msg = (err as Error).message ?? 'timeout';
    // still log the failed attempt
    getDb().prepare(`
      INSERT INTO audit_logs (id, user_id, username, action, target_host, params, result, success)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(generateId(), user.userId, user.username, action, hostname, JSON.stringify({ unit }), msg);
    res.status(504).json({ error: 'Agent did not respond: ' + msg });
    return;
  }

  // write audit log
  getDb().prepare(`
    INSERT INTO audit_logs (id, user_id, username, action, target_host, params, result, success)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId(),
    user.userId,
    user.username,
    action,
    hostname,
    JSON.stringify({ unit: unit ?? '' }),
    result.message,
    result.success ? 1 : 0,
  );

  res.json(result);
});

export default router;
