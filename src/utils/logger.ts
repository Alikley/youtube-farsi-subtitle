
/**
 * لاگر ساده برای مدیریت لاگ‌ها
 */
export class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  info(...args: any[]) {
    console.info(`[INFO][${this.prefix}]`, ...args);
  }

  warn(...args: any[]) {
    console.warn(`[WARN][${this.prefix}]`, ...args);
  }

  error(...args: any[]) {
    console.error(`[ERROR][${this.prefix}]`, ...args);
  }

  debug(...args: any[]) {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[DEBUG][${this.prefix}]`, ...args);
    }
  }
}
