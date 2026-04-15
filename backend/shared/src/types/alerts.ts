/**
 * Alert rule definition
 */
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition: AlertCondition;
  actions: AlertAction[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Alert condition definition
 */
export interface AlertCondition {
  metric?: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  threshold: number;
  duration: number; // milliseconds
  labels?: Record<string, string>;
}

/**
 * Alert action (notification, webhook, etc.)
 */
export interface AlertAction {
  type: 'email' | 'webhook' | 'slack' | 'pagerduty';
  config: Record<string, string>;
}

/**
 * Alert instance
 */
export interface Alert {
  id: string;
  ruleId: string;
  host: string;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'firing' | 'resolved';
  message: string;
  timestamp: number;
  firedAt?: number;
  resolvedAt?: number;
  metadata?: Record<string, string>;
}
