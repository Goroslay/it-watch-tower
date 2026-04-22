import { Router, Response } from 'express';
import { getDb } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', (req: AuthRequest, res: Response): void => {
  const limit = Math.min(parseInt((req.query['limit'] as string) ?? '100'), 500);
  const host = req.query['host'] as string | undefined;

  const where = host ? 'WHERE target_host = ?' : '';
  const params = host ? [host, limit] : [limit];

  const rows = getDb().prepare(`
    SELECT * FROM audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params);

  res.json({ audit: rows });
});

export default router;
