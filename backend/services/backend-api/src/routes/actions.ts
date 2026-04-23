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

export interface HostRow {
  client_id: string | null;
  allowed_units: string;
  allowed_pm2_processes: string;
  allowed_log_cleanup_paths: string;
  restart_server_enabled: number;
}

function sanitizeSubject(v: string): string {
  return v.replace(/[. /\\:]/g, '-');
}

function parseJsonList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function isActionAllowedForHost(action: string, unit: string, host: HostRow): boolean {
  switch (action) {
    case 'start_service':
    case 'stop_service':
    case 'restart_service':
      return unit !== '' && parseJsonList(host.allowed_units).includes(unit);
    case 'restart_pm2':
      return unit !== '' && parseJsonList(host.allowed_pm2_processes).includes(unit);
    case 'log_cleanup':
      return unit !== '' && parseJsonList(host.allowed_log_cleanup_paths).includes(unit);
    case 'restart_server':
      return host.restart_server_enabled === 1;
    default:
      return false;
  }
}

// GET /api/actions/services/:hostname  — returns allowed units + restart flag for this host
router.get('/services/:hostname', (req: AuthRequest, res: Response): void => {
  const { hostname } = req.params;
  const host = getDb().prepare(
    'SELECT client_id, allowed_units, allowed_pm2_processes, allowed_log_cleanup_paths, restart_server_enabled FROM host_registry WHERE hostname = ?'
  ).get(hostname) as HostRow | undefined;

  if (!host) { res.status(404).json({ error: 'Host not found' }); return; }

  const user = req.user!;
  if (user.role !== 'admin' && user.client_id !== host.client_id) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  res.json({
    units: parseJsonList(host.allowed_units),
    pm2_processes: parseJsonList(host.allowed_pm2_processes),
    log_cleanup_paths: parseJsonList(host.allowed_log_cleanup_paths),
    restart_server_enabled: host.restart_server_enabled === 1,
    supported_actions: ['start_service', 'stop_service', 'restart_service', 'restart_pm2', 'log_cleanup', 'restart_server'],
  });
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

  const host = getDb().prepare(`
    SELECT client_id, allowed_units, allowed_pm2_processes, allowed_log_cleanup_paths, restart_server_enabled
    FROM host_registry
    WHERE hostname = ?
  `).get(hostname) as HostRow | undefined;

  if (!host) {
    res.status(404).json({ error: 'Host not found' });
    return;
  }

  // operators can only act on hosts in their client
  if (user.role === 'operator') {
    if (host.client_id !== user.client_id) {
      res.status(403).json({ error: 'Host not in your client' });
      return;
    }
  }

  if (!isActionAllowedForHost(action, unit ?? '', host)) {
    res.status(403).json({ error: 'Action is not allowed for this host or target' });
    return;
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
