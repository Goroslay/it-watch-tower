import { connect, NatsConnection, StringCodec, Msg, Subscription } from 'nats';
import { getDb } from '../db';
import { Logger } from '../config/logger';

interface AgentRegister {
  hostname: string;
  ip_address?: string;
  platform?: string;
  arch?: string;
  os_version?: string;
  agent_version?: string;
  detected_services?: string[];
  allowed_units?: string[];
  allowed_pm2_processes?: string[];
  allowed_log_cleanup_paths?: string[];
  restart_server_enabled?: boolean;
}

interface AgentHeartbeat {
  hostname: string;
  timestamp: number;
}

let instance: NatsSubscriber | null = null;

export function getNats(): NatsSubscriber | null {
  return instance;
}

export class NatsSubscriber {
  private conn: NatsConnection | null = null;
  private codec = StringCodec();
  private logger = new Logger('NatsSubscriber');

  async connect(url: string, user?: string, password?: string): Promise<void> {
    this.conn = await connect({ servers: [url], user, pass: password });
    instance = this;
    this.logger.info('NATS subscriber connected', { url });
    this.subscribeRegistration();
    this.subscribeHeartbeat();
  }

  async request(subject: string, payload: unknown, timeoutMs: number): Promise<Msg> {
    if (!this.conn) throw new Error('NATS not connected');
    return this.conn.request(subject, this.codec.encode(JSON.stringify(payload)), { timeout: timeoutMs });
  }

  decodeMsg(msg: Msg): unknown {
    return JSON.parse(this.codec.decode(msg.data));
  }

  isConnected(): boolean {
    return this.conn !== null && !this.conn.isClosed();
  }

  private subscribeRegistration(): void {
    const sub = this.conn!.subscribe('agents.register');
    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(this.codec.decode(msg.data)) as AgentRegister;
          this.upsertHost(data);
        } catch (err) {
          this.logger.error('Failed to process agent register', err as Error);
        }
      }
    })().catch(() => undefined);
  }

  private subscribeHeartbeat(): void {
    const sub = this.conn!.subscribe('agents.heartbeat');
    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(this.codec.decode(msg.data)) as AgentHeartbeat;
          getDb()
            .prepare("UPDATE host_registry SET last_seen = datetime('now'), status = 'online' WHERE hostname = ?")
            .run(data.hostname);
        } catch {
          // silently ignore heartbeat parse errors
        }
      }
    })().catch(() => undefined);
  }

  private upsertHost(data: AgentRegister): void {
    const services = JSON.stringify(data.detected_services ?? []);
    const units = JSON.stringify(data.allowed_units ?? []);
    const pm2Processes = JSON.stringify(data.allowed_pm2_processes ?? []);
    const logCleanupPaths = JSON.stringify(data.allowed_log_cleanup_paths ?? []);
    const restartEnabled = data.restart_server_enabled ? 1 : 0;
    getDb().prepare(`
      INSERT INTO host_registry (hostname, ip_address, platform, arch, os_version, agent_version, detected_services, allowed_units, allowed_pm2_processes, allowed_log_cleanup_paths, restart_server_enabled, status, last_seen, first_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', datetime('now'), datetime('now'))
      ON CONFLICT(hostname) DO UPDATE SET
        ip_address             = excluded.ip_address,
        platform               = excluded.platform,
        arch                   = excluded.arch,
        os_version             = excluded.os_version,
        agent_version          = excluded.agent_version,
        detected_services      = excluded.detected_services,
        allowed_units          = excluded.allowed_units,
        allowed_pm2_processes  = excluded.allowed_pm2_processes,
        allowed_log_cleanup_paths = excluded.allowed_log_cleanup_paths,
        restart_server_enabled = excluded.restart_server_enabled,
        status                 = 'online',
        last_seen              = datetime('now')
    `).run(
      data.hostname,
      data.ip_address ?? '',
      data.platform ?? '',
      data.arch ?? '',
      data.os_version ?? '',
      data.agent_version ?? '',
      services,
      units,
      pm2Processes,
      logCleanupPaths,
      restartEnabled,
    );
    this.logger.info('Agent registered', { hostname: data.hostname, ip: data.ip_address });
  }

  subscribe(subject: string): Subscription {
    if (!this.conn) throw new Error('NATS not connected');
    return this.conn.subscribe(subject);
  }

  async disconnect(): Promise<void> {
    await this.conn?.close();
    instance = null;
  }
}
