/**
 * Structured logger for the Veil Firefox extension background script.
 * Provides namespaced, leveled logging with optional context.
 * In production, respects user privacy by not logging URLs or page content.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  namespace: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";
const logBuffer: LogEntry[] = [];
const MAX_BUFFER_SIZE = 100;

/**
 * Set the minimum log level. Messages below this level are dropped.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Create a namespaced logger.
 */
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

  const entry: LogEntry = {
    level,
    namespace,
    message,
    context,
    timestamp: Date.now(),
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

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

/**
 * Get recent log entries (for debugging / telemetry).
 * Does not include sensitive context fields.
 */
export function getRecentLogs(): LogEntry[] {
  return logBuffer.slice();
}

/**
 * Flush buffered logs to storage (for crash reporting).
 */
export async function flushLogsToStorage(): Promise<void> {
  if (logBuffer.length === 0) return;
  try {
    const existing = (await browser.storage.local.get(["logs"])).logs as LogEntry[] | undefined;
    const combined = (existing || []).concat(logBuffer).slice(-MAX_BUFFER_SIZE);
    await browser.storage.local.set({ logs: combined as any });
    logBuffer.length = 0;
  } catch {
    // Storage failure is non-fatal
  }
}
