import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../db';

const router = Router();

// Validates X-Internal-Key header — used only by alert-engine (same network)
function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) { next(); return; } // no secret configured → allow (dev mode)
  if (req.headers['x-internal-key'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.get('/alert-rules', internalAuth, (_req, res) => {
  const rules = getDb()
    .prepare('SELECT * FROM alert_rules WHERE enabled = 1 ORDER BY created_at')
    .all();
  res.json({ rules });
});

router.get('/alert-states', internalAuth, (_req, res) => {
  const states = getDb()
    .prepare('SELECT * FROM alert_states ORDER BY updated_at')
    .all();
  res.json({ states });
});

router.put('/alert-states/:key', internalAuth, (req, res) => {
  const { key } = req.params;
  const { rule_id, rule_name, host, alert_id, pending_count = 0, firing = false } = req.body as Record<string, unknown>;

  if (!rule_id || !rule_name || !host || !alert_id) {
    res.status(400).json({ error: 'rule_id, rule_name, host and alert_id are required' });
    return;
  }

  getDb().prepare(`
    INSERT INTO alert_states (state_key, rule_id, rule_name, host, alert_id, pending_count, firing, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(state_key) DO UPDATE SET
      rule_id = excluded.rule_id,
      rule_name = excluded.rule_name,
      host = excluded.host,
      alert_id = excluded.alert_id,
      pending_count = excluded.pending_count,
      firing = excluded.firing,
      updated_at = datetime('now')
  `).run(
    key,
    String(rule_id),
    String(rule_name),
    String(host),
    String(alert_id),
    Number(pending_count),
    firing ? 1 : 0,
  );

  res.status(204).send();
});

export default router;
