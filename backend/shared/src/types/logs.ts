/**
 * Log entry data type
 * Represents a single log line from an agent
 */
export interface LogEntry {
  timestamp: number; // Unix timestamp in milliseconds
  host: string;
  service: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Logs batch for efficient processing
 */
export interface LogsBatch {
  batchId: string;
  timestamp: number;
  logs: LogEntry[];
  sourceAgent: string;
}

/**
 * Validated log ready for storage
 */
export interface ValidatedLog extends LogEntry {
  validated: true;
  validatedAt: number;
}
