import axios from 'axios';

export interface MetricSample {
  host: string;
  value: number;
  labels: Record<string, string>;
}

export class VictoriaMetricsClient {
  constructor(private url: string) {}

  async query(promql: string): Promise<MetricSample[]> {
    const res = await axios.get<{
      status: string;
      data: { result: Array<{ metric: Record<string, string>; value: [number, string] }> };
    }>(`${this.url}/api/v1/query`, {
      params: { query: promql },
      timeout: 5000,
    });

    if (res.data.status !== 'success') return [];

    return res.data.data.result.map((r) => ({
      host: r.metric['host'] ?? r.metric['instance'] ?? 'unknown',
      value: parseFloat(r.value[1]),
      labels: r.metric,
    }));
  }

  async health(): Promise<boolean> {
    try {
      const res = await axios.get<string>(`${this.url}/health`, { timeout: 3000 });
      return res.data.trim() === 'OK';
    } catch {
      return false;
    }
  }
}

export default VictoriaMetricsClient;
