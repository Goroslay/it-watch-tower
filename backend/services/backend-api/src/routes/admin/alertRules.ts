import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../../db';
import { adminOnly } from '../../middleware/auth';

const router = Router();

interface AlertRule {
  id: string;
  name: string;
  promql: string;
  operator: string;
  threshold: number;
  severity: string;
  for_count: number;
  enabled: number;
  notify_slack: number;
  notify_email: string;
  created_at: string;
}

router.get('/', adminOnly, (_req, res) => {
  const rules = getDb().prepare('SELECT * FROM alert_rules ORDER BY created_at').all() as AlertRule[];
  res.json({ rules });
});

router.post('/', adminOnly, (req, res) => {
  const { name, promql, operator = 'gt', threshold, severity = 'high', for_count = 1,
          notify_slack = false, notify_email = '' } = req.body as Record<string, unknown>;

  if (!name || !promql || threshold === undefined) {
    return res.status(400).json({ error: 'name, promql and threshold are required' });
  }

  const id = randomUUID();
  getDb().prepare(`
    INSERT INTO alert_rules (id, name, promql, operator, threshold, severity, for_count, enabled, notify_slack, notify_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, name, promql, operator, threshold, severity, for_count, notify_slack ? 1 : 0, notify_email);

  const rule = getDb().prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as AlertRule;
  return res.status(201).json(rule);
});

router.put('/:id', adminOnly, (req, res) => {
  const { id } = req.params;
  const existing = getDb().prepare('SELECT id FROM alert_rules WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });

  const { name, promql, operator, threshold, severity, for_count,
          enabled, notify_slack, notify_email } = req.body as Record<string, unknown>;

  getDb().prepare(`
    UPDATE alert_rules
    SET name = COALESCE(?, name),
        promql = COALESCE(?, promql),
        operator = COALESCE(?, operator),
        threshold = COALESCE(?, threshold),
        severity = COALESCE(?, severity),
        for_count = COALESCE(?, for_count),
        enabled = COALESCE(?, enabled),
        notify_slack = COALESCE(?, notify_slack),
        notify_email = COALESCE(?, notify_email)
    WHERE id = ?
  `).run(name ?? null, promql ?? null, operator ?? null, threshold ?? null,
         severity ?? null, for_count ?? null,
         enabled !== undefined ? (enabled ? 1 : 0) : null,
         notify_slack !== undefined ? (notify_slack ? 1 : 0) : null,
         notify_email ?? null, id);

  const rule = getDb().prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as AlertRule;
  return res.json(rule);
});

router.delete('/:id', adminOnly, (req, res) => {
  const { id } = req.params;
  const existing = getDb().prepare('SELECT id FROM alert_rules WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });
  getDb().prepare('DELETE FROM alert_rules WHERE id = ?').run(id);
  return res.status(204).send();
});

export default router;
