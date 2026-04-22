import { Router, Response } from 'express';
import axios from 'axios';
import config from '../config';
import { AuthRequest } from '../middleware/auth';
import { getAllowedHostnames } from '../db/helpers';

const router = Router();
const vmUrl = config.victoriaMetrics.url;

router.get('/names', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await axios.get<{ data: string[] }>(`${vmUrl}/api/v1/label/__name__/values`, { timeout: 5000 });
    res.json({ metrics: r.data.data });
  } catch (err) {
    res.status(502).json({ error: 'Failed to query VictoriaMetrics', detail: (err as Error).message });
  }
});

router.get('/hosts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await axios.get<{ data: string[] }>(`${vmUrl}/api/v1/label/host/values`, { timeout: 5000 });
    const allHosts: string[] = r.data.data;
    const allowed = getAllowedHostnames(req.user!);
    const hosts = allowed === null ? allHosts : allHosts.filter((h) => allowed.includes(h));
    res.json({ hosts });
  } catch (err) {
    res.status(502).json({ error: 'Failed to query hosts', detail: (err as Error).message });
  }
});

router.get('/query', async (req: AuthRequest, res: Response): Promise<void> => {
  const { query, start, end, step } = req.query as Record<string, string>;
  if (!query) { res.status(400).json({ error: 'query parameter required' }); return; }

  try {
    const endpoint = start && end ? '/api/v1/query_range' : '/api/v1/query';
    const params: Record<string, string> = { query };
    if (start) params.start = start;
    if (end) params.end = end;
    if (step) params.step = step;
    const r = await axios.get(`${vmUrl}${endpoint}`, { params, timeout: 10000 });
    res.json(r.data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to query VictoriaMetrics', detail: (err as Error).message });
  }
});

export default router;
