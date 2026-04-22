import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import { Logger } from './config/logger';
import { initDb } from './db';
import { NatsSubscriber } from './services/natsSubscriber';
import { authMiddleware, adminOnly } from './middleware/auth';
import authRouter from './routes/auth';
import metricsRouter from './routes/metrics';
import logsRouter from './routes/logs';
import alertsRouter from './routes/alerts';
import actionsRouter from './routes/actions';
import auditRouter from './routes/audit';
import healthRouter from './routes/health';
import clientsRouter from './routes/admin/clients';
import environmentsRouter from './routes/admin/environments';
import usersRouter from './routes/admin/users';
import hostsAdminRouter from './routes/admin/hosts';

const logger = new Logger('BackendAPI', config.service.logLevel);

async function main(): Promise<void> {
  // Init SQLite
  initDb(config.db.path);
  logger.info('Database initialized', { path: config.db.path });

  // Start NATS subscriber for agent registration
  const nats = new NatsSubscriber();
  try {
    await nats.connect(config.nats.url, config.nats.user, config.nats.password);
  } catch (err) {
    logger.warn('NATS subscriber could not connect — agent registration disabled', { error: (err as Error).message });
  }

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Public
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'backend-api' }));
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);

  // Protected — data
  app.use('/api/metrics',  authMiddleware, metricsRouter);
  app.use('/api/logs',     authMiddleware, logsRouter);
  app.use('/api/alerts',   authMiddleware, alertsRouter);
  app.use('/api/actions',  authMiddleware, actionsRouter);

  // Protected — admin only
  app.use('/api/audit',          authMiddleware, adminOnly, auditRouter);
  app.use('/admin/clients',      authMiddleware, adminOnly, clientsRouter);
  app.use('/admin/environments', authMiddleware, adminOnly, environmentsRouter);
  app.use('/admin/users',        authMiddleware, adminOnly, usersRouter);
  app.use('/admin/hosts',        authMiddleware, adminOnly, hostsAdminRouter);

  app.listen(config.server.port, () => {
    logger.info(`Backend API listening on port ${config.server.port}`);
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await nats.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: Error) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
