import axios from 'axios';

export interface AlertRow {
  timestamp: string;
  alert_id: string;
  host: string;
  service: string;
  rule_name: string;
  severity: string;
  status: string;
  message: string;
  metadata: Record<string, string>;
  fired_at: string;
  resolved_at: string;
}

const ZERO_DT = '1970-01-01 00:00:00';

export class ClickhouseClient {
  constructor(
    private url: string,
    private db: string,
  ) {}

  async insertAlert(alert: AlertRow): Promise<void> {
    const row: AlertRow = {
      ...alert,
      fired_at: alert.fired_at || ZERO_DT,
      resolved_at: alert.resolved_at || ZERO_DT,
    };
    const query = `INSERT INTO ${this.db}.alerts FORMAT JSONEachRow`;
    await axios.post(`${this.url}/?query=${encodeURIComponent(query)}&user=default`, JSON.stringify(row), {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 5000,
    });
  }

  async health(): Promise<boolean> {
    try {
      const res = await axios.get<string>(`${this.url}/ping`, { timeout: 3000 });
      return (res.data as string).includes('Ok');
    } catch {
      return false;
    }
  }
}

export default ClickhouseClient;
