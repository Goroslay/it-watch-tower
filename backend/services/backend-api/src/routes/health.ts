import { Router, Request, Response } from 'express';
import axios from 'axios';
import config from '../config';

const router = Router();

async function probe(url: string): Promise<boolean> {
  try {
    await axios.get(url, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

router.get('/full', async (_req: Request, res: Response): Promise<void> => {
  const [vm, ch] = await Promise.all([
    probe(`${config.victoriaMetrics.url}/health`),
    probe(`${config.clickhouse.url}/ping`),
  ]);

  const status = vm && ch ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 207).json({
    status,
    checks: {
      victoriaMetrics: vm ? 'ok' : 'unreachable',
      clickhouse: ch ? 'ok' : 'unreachable',
    },
    timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).replace(' ', 'T'),
  });
});

export default router;
