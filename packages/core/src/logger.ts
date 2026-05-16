/**
 * Minimal structured logger for @veil/core.
 * No storage dependency — logs to console only.
 * In production builds, log level can be set to "warn" or "error" to reduce noise.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel =
  typeof process !== "undefined" && process.env && process.env["NODE_ENV"] === "production"
    ? "warn"
    : "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function createLogger(namespace: string) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      log("debug", namespace, message, context),
    info: (message: string, context?: Record<string, unknown>) =>
      log("info", namespace, message, context),
    warn: (message: string, context?: Record<string, unknown>) =>
      log("warn", namespace, message, context),
    error: (message: string, context?: Record<string, unknown>) =>
      log("error", namespace, message, context),
  };
}

function log(
  level: LogLevel,
  namespace: string,
  message: string,
  context?: Record<string, unknown>
): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const prefix = `[${level.toUpperCase()}] [${namespace}]`;
  const args: unknown[] = [`${prefix} ${message}`];
  if (context) args.push(context);

  switch (level) {
    case "debug":
      console.debug(...args);
      break;
    case "info":
      console.info(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    case "error":
      console.error(...args);
      break;
  }
}
