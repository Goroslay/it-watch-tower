import axios from 'axios';
import { Logger } from '../config/logger';

interface LogRow {
  timestamp: string;
  host: string;
  service: string;
  log_level: string;
  message: string;
  metadata: Record<string, string>;
}

export class ClickhouseClient {
  private logger: Logger;

  constructor(
    private url: string,
    private db: string,
  ) {
    this.logger = new Logger('ClickhouseClient');
  }

  async insertLogs(rows: LogRow[]): Promise<void> {
    if (rows.length === 0) return;

    const body = rows.map((r) => JSON.stringify(r)).join('\n');
    const query = `INSERT INTO ${this.db}.logs (timestamp,host,service,log_level,message,metadata) FORMAT JSONEachRow`;

    try {
      await axios.post(`${this.url}/?query=${encodeURIComponent(query)}&user=default`, body, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 10000,
      });
    } catch (err) {
      this.logger.error('Failed to insert logs', err as Error);
      throw err;
    }
  }

  async health(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.url}/ping`, { timeout: 3000 });
      return res.data === 'Ok.\n' || res.data === 'Ok.';
    } catch {
      return false;
    }
  }
}

export default ClickhouseClient;
