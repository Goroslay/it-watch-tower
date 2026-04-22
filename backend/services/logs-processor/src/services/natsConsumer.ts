import { connect, NatsConnection, consumerOpts, RetentionPolicy, StorageType } from 'nats';
import { Logger } from '../config/logger';

interface LogEntry {
  timestamp: number;
  host: string;
  service: string;
  level: string;
  message: string;
  metadata?: Record<string, string>;
}

export interface LogsBatch {
  batchId: string;
  timestamp: number;
  logs: LogEntry[];
  sourceAgent: string;
}

export class NatsConsumer {
  private connection: NatsConnection | null = null;
  private logger: Logger;

  constructor(
    private natsUrl: string,
    private natsUser?: string,
    private natsPassword?: string,
  ) {
    this.logger = new Logger('NatsConsumer');
  }

  async connect(): Promise<void> {
    this.connection = await connect({
      servers: [this.natsUrl],
      user: this.natsUser,
      pass: this.natsPassword,
    });
    this.logger.info('Connected to NATS', { url: this.natsUrl });

    (async () => {
      for await (const status of this.connection!.status()) {
        if (status.type !== 'pingTimer') {
          this.logger.info('NATS status', { type: status.type });
        }
      }
    })().catch(() => undefined);
  }

  async subscribeLogs(callback: (batch: LogsBatch) => Promise<void>): Promise<void> {
    if (!this.connection) throw new Error('Not connected to NATS');

    const jsm = await this.connection.jetstreamManager();
    try {
      await jsm.streams.info('LOGS');
    } catch {
      await jsm.streams.add({
        name: 'LOGS',
        subjects: ['logs.>'],
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
      });
      this.logger.info('Created LOGS stream');
    }

    const js = this.connection.jetstream();
    const opts = consumerOpts();
    opts.durable('logs-processor-durable');
    opts.deliverTo('logs-processor-deliver');
    opts.queue('logs-processor-queue');
    opts.manualAck();
    opts.maxDeliver(3);

    const sub = await js.subscribe('logs.>', opts);
    this.logger.info('Subscribed to logs', { subject: 'logs.>' });

    (async () => {
      for await (const msg of sub) {
        try {
          const batch = JSON.parse(new TextDecoder().decode(msg.data)) as LogsBatch;
          await callback(batch);
          msg.ack();
        } catch (err) {
          this.logger.error('Error processing log message', err as Error);
          msg.nak();
        }
      }
    })().catch((err: Error) => this.logger.error('Consumer error', err));
  }

  async disconnect(): Promise<void> {
    await this.connection?.close();
  }
}

export default NatsConsumer;
