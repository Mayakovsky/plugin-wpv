export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const PREFIX = "[wpv]";
let minLevel: LogLevel = "info";

class Logger {
  private prefix: string;

  constructor(prefix = PREFIX) {
    this.prefix = prefix;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
  }

  private fmt(level: LogLevel, message: string, ctx?: Record<string, unknown>): string {
    const parts = [this.prefix, `[${level.toUpperCase()}]`, message];
    if (ctx && Object.keys(ctx).length > 0) {
      parts.push("| " + Object.entries(ctx).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" "));
    }
    return parts.join(" ");
  }

  debug(message: string, ctx?: Record<string, unknown>): void {
    if (!this.shouldLog("debug")) return;
    console.debug(this.fmt("debug", message, ctx));
  }

  info(message: string, ctx?: Record<string, unknown>): void {
    if (!this.shouldLog("info")) return;
    console.log(this.fmt("info", message, ctx));
  }

  warn(message: string, ctx?: Record<string, unknown>, error?: unknown): void {
    if (!this.shouldLog("warn")) return;
    console.warn(this.fmt("warn", message, ctx));
  }

  error(message: string, ctx?: Record<string, unknown>, error?: unknown): void {
    if (!this.shouldLog("error")) return;
    console.error(this.fmt("error", message, ctx));
    if (error) console.error(error);
  }

  child(additionalContext: Record<string, unknown>): ContextualLogger {
    return new ContextualLogger(this, additionalContext);
  }
}

class ContextualLogger {
  constructor(private parent: Logger, private context: Record<string, unknown>) {}

  debug(message: string, ctx?: Record<string, unknown>): void {
    this.parent.debug(message, { ...this.context, ...ctx });
  }
  info(message: string, ctx?: Record<string, unknown>): void {
    this.parent.info(message, { ...this.context, ...ctx });
  }
  warn(message: string, ctx?: Record<string, unknown>, error?: unknown): void {
    this.parent.warn(message, { ...this.context, ...ctx }, error);
  }
  error(message: string, ctx?: Record<string, unknown>, error?: unknown): void {
    this.parent.error(message, { ...this.context, ...ctx }, error);
  }
}

export const logger = new Logger();

export function createLogger(context: Record<string, unknown>): ContextualLogger {
  return logger.child(context);
}

if (typeof process !== "undefined" && process.env?.LOG_LEVEL) {
  minLevel = process.env.LOG_LEVEL as LogLevel;
}
