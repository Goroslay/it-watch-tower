/**
 * Simple logger for the service
 */
interface LogData {
  [key: string]: unknown;
}

export class Logger {
  private context: string;
  private logLevel: string;
  private tz = 'America/Bogota';

  constructor(context: string, logLevel: string = 'info') {
    this.context = context;
    this.logLevel = logLevel;
  }

  private now(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: this.tz, hour12: false }).replace(' ', 'T');
  }

  debug(msg: string, data?: LogData): void {
    if (this.shouldLog('debug')) {
      console.log(`[${this.now()}] [DEBUG] [${this.context}] ${msg}`, data ?? '');
    }
  }

  info(msg: string, data?: LogData): void {
    if (this.shouldLog('info')) {
      console.log(`[${this.now()}] [INFO] [${this.context}] ${msg}`, data ?? '');
    }
  }

  warn(msg: string, data?: LogData): void {
    if (this.shouldLog('warn')) {
      console.warn(`[${this.now()}] [WARN] [${this.context}] ${msg}`, data ?? '');
    }
  }

  error(msg: string, error?: Error | LogData): void {
    if (this.shouldLog('error')) {
      if (error instanceof Error) {
        console.error(
          `[${this.now()}] [ERROR] [${this.context}] ${msg}`,
          error.message,
          error.stack
        );
      } else {
        console.error(`[${this.now()}] [ERROR] [${this.context}] ${msg}`, error ?? '');
      }
    }
  }

  private shouldLog(level: string): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return (levels[level as keyof typeof levels] ?? 0) >= (levels[this.logLevel as keyof typeof levels] ?? 0);
  }
}

export default Logger;
