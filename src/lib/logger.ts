/**
 * Structured JSON logger
 * Output: { timestamp, level, service, message, ...metadata }
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && LOG_LEVEL_PRIORITY[envLevel] !== undefined) {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
  const currentLevel = getCurrentLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function log(
  level: LogLevel,
  service: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...metadata,
  };

  const formatted = formatEntry(entry);

  if (level === 'error') {
    process.stderr.write(formatted + '\n');
  } else {
    process.stdout.write(formatted + '\n');
  }
}

export class Logger {
  constructor(private readonly service: string) {}

  debug(message: string, metadata?: Record<string, unknown>): void {
    log('debug', this.service, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    log('info', this.service, message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    log('warn', this.service, message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    log('error', this.service, message, metadata);
  }

  child(subService: string): Logger {
    return new Logger(`${this.service}:${subService}`);
  }
}

export function createLogger(service: string): Logger {
  return new Logger(service);
}

// Default logger for general use
export const logger = createLogger('app');
