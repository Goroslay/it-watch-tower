import { randomUUID } from 'crypto';
import axios from 'axios';
import { VictoriaMetricsClient } from '../services/victoriaMetricsClient';
import { ClickhouseClient } from '../services/clickhouseClient';
import { Logger } from '../config/logger';
import config from '../config';
import { notify } from '../services/notifier';

export interface AlertRule {
  id: string;
  name: string;
  promql: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  threshold: number;
  severity: string;
  for_count: number;
  notify_slack: number;
  notify_email: string;
}

interface FiringState {
  alertId: string;
  pendingCount: number; // evaluations above threshold while not yet firing
  firing: boolean;
}

interface PersistedAlertState {
  state_key: string;
  alert_id: string;
  pending_count: number;
  firing: number;
}

function crosses(operator: string, value: number, threshold: number): boolean {
  switch (operator) {
    case 'gt':  return value > threshold;
    case 'lt':  return value < threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    default:    return false;
  }
}

function nowTs(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export class Evaluator {
  private logger: Logger;
  private rules: AlertRule[] = [];
  private states = new Map<string, FiringState>(); // key = ruleName:host

  constructor(
    private vm: VictoriaMetricsClient,
    private ch: ClickhouseClient,
  ) {
    this.logger = new Logger('Evaluator');
  }

  async loadRules(): Promise<void> {
    try {
      const res = await axios.get<{ rules: AlertRule[] }>(
        `${config.backendApi.url}/internal/alert-rules`,
        {
          headers: { 'x-internal-key': config.backendApi.internalSecret },
          timeout: 5000,
        },
      );
      this.rules = res.data.rules ?? [];
      this.logger.info(`Loaded ${this.rules.length} alert rules`);
    } catch (err) {
      this.logger.error('Failed to load alert rules from backend-api', err as Error);
    }
  }

  async loadStates(): Promise<void> {
    try {
      const res = await axios.get<{ states: PersistedAlertState[] }>(
        `${config.backendApi.url}/internal/alert-states`,
        {
          headers: { 'x-internal-key': config.backendApi.internalSecret },
          timeout: 5000,
        },
      );

      this.states.clear();
      for (const state of res.data.states ?? []) {
        this.states.set(state.state_key, {
          alertId: state.alert_id,
          pendingCount: Number(state.pending_count),
          firing: state.firing === 1,
        });
      }
      this.logger.info(`Loaded ${this.states.size} alert states`);
    } catch (err) {
      this.logger.error('Failed to load alert states from backend-api', err as Error);
    }
  }

  async evaluate(): Promise<void> {
    for (const rule of this.rules) {
      try {
        await this.evaluateRule(rule);
      } catch (err) {
        this.logger.error(`Error evaluating rule ${rule.name}`, err as Error);
      }
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<void> {
    const samples = await this.vm.query(rule.promql);

    for (const sample of samples) {
      const key = `${rule.name}:${sample.host}`;
      let state = this.states.get(key);
      if (!state) {
        state = { alertId: randomUUID(), pendingCount: 0, firing: false };
        this.states.set(key, state);
      }

      const shouldFire = crosses(rule.operator, sample.value, rule.threshold);

      if (shouldFire) {
        state.pendingCount++;
        await this.persistState(key, rule, sample.host, state);

        // Fire only after for_count consecutive evaluations
        if (!state.firing && state.pendingCount >= rule.for_count) {
          state.firing = true;
          state.alertId = randomUUID();
          await this.persistState(key, rule, sample.host, state);
          const ts = nowTs();

          const message = `${rule.name}: value ${sample.value.toFixed(2)} ${rule.operator} ${rule.threshold} on ${sample.host}`;

          await this.ch.insertAlert({
            timestamp: ts,
            alert_id: state.alertId,
            host: sample.host,
            service: sample.labels['service'] ?? rule.name,
            rule_name: rule.name,
            severity: rule.severity,
            status: 'firing',
            message,
            metadata: { metric: rule.promql, value: String(sample.value), rule_id: rule.id },
            fired_at: ts,
            resolved_at: '1970-01-01 00:00:00',
          });

          this.logger.warn(`Alert firing: ${rule.name}`, { host: sample.host, value: sample.value, after: state.pendingCount });

          await notify(
            { ruleName: rule.name, host: sample.host, severity: rule.severity, message, status: 'firing', value: sample.value, threshold: rule.threshold },
            rule.notify_slack === 1,
            rule.notify_email,
          );
        }
      } else {
        // Below threshold — resolve if was firing
        if (state.firing) {
          state.firing = false;
          const ts = nowTs();
          const message = `${rule.name} resolved on ${sample.host} (value: ${sample.value.toFixed(2)})`;

          await this.ch.insertAlert({
            timestamp: ts,
            alert_id: state.alertId,
            host: sample.host,
            service: sample.labels['service'] ?? rule.name,
            rule_name: rule.name,
            severity: rule.severity,
            status: 'resolved',
            message,
            metadata: { metric: rule.promql, value: String(sample.value), rule_id: rule.id },
            fired_at: '1970-01-01 00:00:00',
            resolved_at: ts,
          });

          this.logger.info(`Alert resolved: ${rule.name}`, { host: sample.host, value: sample.value });

          await notify(
            { ruleName: rule.name, host: sample.host, severity: rule.severity, message, status: 'resolved', value: sample.value, threshold: rule.threshold },
            rule.notify_slack === 1,
            rule.notify_email,
          );
        }
        // Reset pending count once back below threshold
        state.pendingCount = 0;
        state.alertId = randomUUID();
        await this.persistState(key, rule, sample.host, state);
      }
    }
  }

  private async persistState(key: string, rule: AlertRule, host: string, state: FiringState): Promise<void> {
    try {
      await axios.put(
        `${config.backendApi.url}/internal/alert-states/${encodeURIComponent(key)}`,
        {
          rule_id: rule.id,
          rule_name: rule.name,
          host,
          alert_id: state.alertId,
          pending_count: state.pendingCount,
          firing: state.firing,
        },
        {
          headers: { 'x-internal-key': config.backendApi.internalSecret },
          timeout: 5000,
        },
      );
    } catch (err) {
      this.logger.error(`Failed to persist alert state ${key}`, err as Error);
    }
  }
}

export default Evaluator;
