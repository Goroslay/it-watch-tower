import { Router, Response } from 'express';
import { StringCodec } from 'nats';
import { AuthRequest } from '../middleware/auth';
import { getNats } from '../services/natsSubscriber';
import { getAllowedHostnames } from '../db/helpers';

const router = Router();
const sc = StringCodec();

// SSE endpoint — streams real-time logs and alerts for a specific host.
// Client connects with EventSource('/api/sse?host=<hostname>')
// Events: 'log' and 'alert', both with JSON payloads.
router.get('/', (req: AuthRequest, res: Response): void => {
  const { host } = req.query as { host?: string };

  // Permission check
  const allowed = getAllowedHostnames(req.user!);
  if (allowed !== null && host && !allowed.includes(host)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const nats = getNats();
  if (!nats || !nats.isConnected()) {
    res.status(503).json({ error: 'NATS not available' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send a heartbeat comment every 20s to keep the connection alive
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to logs subject
  const logSubject = host
    ? `logs.${host.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    : 'logs.*';

  let logSub: ReturnType<typeof nats.subscribe> | null = null;
  try {
    logSub = nats.subscribe(logSubject);
    (async () => {
      for await (const msg of logSub!) {
        try {
          const batch = JSON.parse(sc.decode(msg.data)) as { logs?: unknown[] };
          for (const entry of batch.logs ?? []) {
            send('log', entry);
          }
        } catch { /* ignore malformed messages */ }
      }
    })().catch(() => undefined);
  } catch { /* NATS subscribe failed */ }

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    try { logSub?.unsubscribe(); } catch { /* ignore */ }
  });
});

export default router;
