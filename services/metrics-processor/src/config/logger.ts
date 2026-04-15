/**
 * Simple logger for the service
 */
interface LogData {
  [key: string]: unknown;
}

export class Logger {
  private context: string;
  private logLevel: string;

  constructor(context: string, logLevel: string = 'info') {
    this.context = context;
    this.logLevel = logLevel;
  }

  debug(msg: string, data?: LogData): void {
    if (this.shouldLog('debug')) {
      console.log(`[${new Date().toISOString()}] [DEBUG] [${this.context}] ${msg}`, data ?? '');
    }
  }

  info(msg: string, data?: LogData): void {
    if (this.shouldLog('info')) {
      console.log(`[${new Date().toISOString()}] [INFO] [${this.context}] ${msg}`, data ?? '');
    }
  }

  warn(msg: string, data?: LogData): void {
    if (this.shouldLog('warn')) {
      console.warn(`[${new Date().toISOString()}] [WARN] [${this.context}] ${msg}`, data ?? '');
    }
  }

  error(msg: string, error?: Error | LogData): void {
    if (this.shouldLog('error')) {
      if (error instanceof Error) {
        console.error(
          `[${new Date().toISOString()}] [ERROR] [${this.context}] ${msg}`,
          error.message,
          error.stack
        );
      } else {
        console.error(`[${new Date().toISOString()}] [ERROR] [${this.context}] ${msg}`, error ?? '');
      }
    }
  }

  private shouldLog(level: string): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return (levels[level as keyof typeof levels] ?? 0) >= (levels[this.logLevel as keyof typeof levels] ?? 0);
  }
}

export default Logger;
