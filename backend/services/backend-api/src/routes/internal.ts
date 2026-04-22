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

export default router;
