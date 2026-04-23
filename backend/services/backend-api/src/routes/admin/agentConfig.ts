import { Router, Request, Response } from 'express';
import { getDb } from '../../db';
import { getNats } from '../../services/natsSubscriber';

const router = Router();

export const DEFAULT_AGENT_CONFIG = {
  disk_paths:              [] as string[],
  log_paths:               [] as string[],
  nginx:                   [] as ServiceEntry[],
  tomcat:                  [] as ServiceEntry[],
  wildfly:                 [] as ServiceEntry[],
  pm2_enabled:             false,
  pm2_logs:                [] as { name: string; path: string }[],
  oracle_enabled:          false,
  oracle_dsn:              '',
  allowed_units:           [] as string[],
  allowed_pm2_processes:   [] as string[],
  allowed_log_cleanup_paths: [] as string[],
  restart_server_enabled:  false,
};

export interface ServiceEntry {
  name:            string;
  path:            string;
  log_path?:       string;
  access_log_path?: string;
}

export function getAgentConfig(hostname: string): typeof DEFAULT_AGENT_CONFIG {
  const row = getDb()
    .prepare('SELECT config_json FROM agent_configs WHERE hostname = ?')
    .get(hostname) as { config_json: string } | undefined;
  return row ? (JSON.parse(row.config_json) as typeof DEFAULT_AGENT_CONFIG) : { ...DEFAULT_AGENT_CONFIG };
}

export function pushConfigToAgent(hostname: string, config: unknown): void {
  const nats = getNats();
  if (!nats?.isConnected()) return;
  const subject = 'config.' + hostname.replace(/[. /\\:]/g, '-');
  nats.publish(subject, config);
}

// GET /admin/agent-config/:hostname
router.get('/:hostname', (_req: Request, res: Response): void => {
  const { hostname } = _req.params;
  res.json({ config: getAgentConfig(hostname) });
});

// PUT /admin/agent-config/:hostname
router.put('/:hostname', (req: Request, res: Response): void => {
  const { hostname } = req.params;
  const config = req.body as typeof DEFAULT_AGENT_CONFIG;

  getDb().prepare(`
    INSERT INTO agent_configs (hostname, config_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(hostname) DO UPDATE SET
      config_json = excluded.config_json,
      updated_at  = excluded.updated_at
  `).run(hostname, JSON.stringify(config));

  pushConfigToAgent(hostname, config);

  res.json({ ok: true });
});

export default router;
