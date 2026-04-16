import { connect, NatsConnection, consumerOpts } from 'nats';
import { Logger } from '../config/logger';
import { MetricsBatch } from '@itwatchtower/shared';

/**
 * NATS consumer for metrics
 */
export class NatsConsumer {
  private connection: NatsConnection | null = null;
  private logger: Logger;
  private natsUrl: string;
  private natsUser?: string;
  private natsPassword?: string;

  constructor(natsUrl: string, user?: string, password?: string) {
    this.logger = new Logger('NatsConsumer');
    this.natsUrl = natsUrl;
    this.natsUser = user;
    this.natsPassword = password;
  }

  /**
   * Connect to NATS server
   */
  async connect(): Promise<void> {
    try {
      this.connection = await connect({
        servers: [this.natsUrl],
        user: this.natsUser,
        pass: this.natsPassword,
      });

      this.logger.info('Connected to NATS', {
        url: this.natsUrl,
      });

      // Handle connection events
      (async () => {
        for await (const status of this.connection!.status()) {
          this.logger.info('NATS status change', {
            type: status.type,
            data: status.data,
          });
        }
      })();
    } catch (error) {
      this.logger.error('Failed to connect to NATS', error as Error);
      throw error;
    }
  }

  /**
   * Subscribe to metrics topic
   */
  async subscribeToMetrics(
    subject: string,
    callback: (batch: MetricsBatch) => Promise<void>
  ): Promise<() => void> {
    if (!this.connection) {
      throw new Error('Not connected to NATS');
    }



    try {
      // Get or create JetStream
      const js = this.connection.jetstream();

      // Build JetStream consumer options
      const opts = consumerOpts();
      opts.durable('metrics-processor-durable');
      opts.queue('metrics-processor-queue');

      // Subscribe with JetStream
      const sub = await js.subscribe(subject, opts);

      this.logger.info('Subscribed to metrics', { subject });

      // Start consuming messages
      (async () => {
        try {
          for await (const msg of sub) {
            try {
              const batch = JSON.parse(new TextDecoder().decode(msg.data)) as MetricsBatch;
              await callback(batch);
              msg.ack();
            } catch (error) {
              this.logger.error('Error processing metric message', error as Error);
              msg.nak();
            }
          }
        } catch (error) {
          this.logger.error('Consumer error', error as Error);
        }
      })();

      // Return unsubscribe function
      return () => {
        sub.unsubscribe();
      };
    } catch (error) {
      this.logger.error('Failed to subscribe to metrics', error as Error);
      throw error;
    }
  }

  /**
   * Disconnect from NATS
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.logger.info('Disconnected from NATS');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connection !== null && !this.connection.isClosed();
  }
}

export default NatsConsumer;
