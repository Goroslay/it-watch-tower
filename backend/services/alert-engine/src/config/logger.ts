interface LogData {
  [key: string]: unknown;
}

export class Logger {
  private context: string;
  private logLevel: string;
  private tz = 'America/Bogota';

  constructor(context: string, logLevel = 'info') {
    this.context = context;
    this.logLevel = logLevel;
  }

  private now(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: this.tz, hour12: false }).replace(' ', 'T');
  }

  private shouldLog(level: string): boolean {
    const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return (levels[level] ?? 0) >= (levels[this.logLevel] ?? 0);
  }

  info(msg: string, data?: LogData): void {
    if (this.shouldLog('info')) console.log(`[${this.now()}] [INFO] [${this.context}] ${msg}`, data ?? '');
  }

  warn(msg: string, data?: LogData): void {
    if (this.shouldLog('warn')) console.warn(`[${this.now()}] [WARN] [${this.context}] ${msg}`, data ?? '');
  }

  error(msg: string, err?: Error | LogData): void {
    if (!this.shouldLog('error')) return;
    if (err instanceof Error) {
      console.error(`[${this.now()}] [ERROR] [${this.context}] ${msg}`, err.message, err.stack);
    } else {
      console.error(`[${this.now()}] [ERROR] [${this.context}] ${msg}`, err ?? '');
    }
  }
}

export default Logger;
