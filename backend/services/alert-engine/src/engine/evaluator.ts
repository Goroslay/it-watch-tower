import { randomUUID } from 'crypto';
import { VictoriaMetricsClient } from '../services/victoriaMetricsClient';
import { ClickhouseClient } from '../services/clickhouseClient';
import { Logger } from '../config/logger';

interface Rule {
  name: string;
  metric: string;
  operator: 'gt' | 'lt';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  service: string;
  message: (host: string, value: number) => string;
}

const RULES: Rule[] = [
  {
    name: 'high_cpu',
    metric: 'system_cpu_usage_percent',
    operator: 'gt',
    threshold: 85,
    severity: 'high',
    service: 'system',
    message: (host, v) => `CPU usage at ${v.toFixed(1)}% on ${host} (threshold: 85%)`,
  },
  {
    name: 'high_memory',
    metric: 'system_memory_usage_percent',
    operator: 'gt',
    threshold: 90,
    severity: 'high',
    service: 'system',
    message: (host, v) => `Memory usage at ${v.toFixed(1)}% on ${host} (threshold: 90%)`,
  },
  {
    name: 'high_disk',
    metric: 'system_disk_usage_percent',
    operator: 'gt',
    threshold: 90,
    severity: 'critical',
    service: 'system',
    message: (host, v) => `Disk usage at ${v.toFixed(1)}% on ${host} (threshold: 90%)`,
  },
];

function nowTs(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function crosses(rule: Rule, value: number): boolean {
  return rule.operator === 'gt' ? value > rule.threshold : value < rule.threshold;
}

export class Evaluator {
  private logger: Logger;
  private firing = new Map<string, string>(); // key=rule:host, value=alert_id

  constructor(
    private vm: VictoriaMetricsClient,
    private ch: ClickhouseClient,
  ) {
    this.logger = new Logger('Evaluator');
  }

  async evaluate(): Promise<void> {
    for (const rule of RULES) {
      try {
        await this.evaluateRule(rule);
      } catch (err) {
        this.logger.error(`Error evaluating rule ${rule.name}`, err as Error);
      }
    }
  }

  private async evaluateRule(rule: Rule): Promise<void> {
    const samples = await this.vm.query(rule.metric);

    for (const sample of samples) {
      const key = `${rule.name}:${sample.host}`;
      const isFiring = this.firing.has(key);
      const shouldFire = crosses(rule, sample.value);

      if (shouldFire && !isFiring) {
        const alertId = randomUUID();
        this.firing.set(key, alertId);
        const ts = nowTs();

        await this.ch.insertAlert({
          timestamp: ts,
          alert_id: alertId,
          host: sample.host,
          service: rule.service,
          rule_name: rule.name,
          severity: rule.severity,
          status: 'firing',
          message: rule.message(sample.host, sample.value),
          metadata: { metric: rule.metric, value: String(sample.value) },
          fired_at: ts,
          resolved_at: '1970-01-01 00:00:00',
        });

        this.logger.warn(`Alert firing: ${rule.name}`, { host: sample.host, value: sample.value });
      } else if (!shouldFire && isFiring) {
        const alertId = this.firing.get(key)!;
        this.firing.delete(key);
        const ts = nowTs();

        await this.ch.insertAlert({
          timestamp: ts,
          alert_id: alertId,
          host: sample.host,
          service: rule.service,
          rule_name: rule.name,
          severity: rule.severity,
          status: 'resolved',
          message: `${rule.name} resolved on ${sample.host}`,
          metadata: { metric: rule.metric, value: String(sample.value) },
          fired_at: '1970-01-01 00:00:00',
          resolved_at: ts,
        });

        this.logger.info(`Alert resolved: ${rule.name}`, { host: sample.host });
      }
    }
  }
}

export default Evaluator;
