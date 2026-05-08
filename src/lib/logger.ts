/**
 * Centralized logger utility.
 * Wraps console.* with structured context and can be extended
 * to send logs to external services or suppress in production.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

const IS_DEV = import.meta.env.DEV;

function formatEntry(entry: LogEntry): string {
  return `[${entry.module}] ${entry.message}`;
}

function createLogger(module: string) {
  const log = (level: LogLevel, message: string, data?: unknown) => {
    const entry: LogEntry = {
      level,
      module,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    const formatted = formatEntry(entry);

    switch (level) {
      case 'debug':
        if (IS_DEV) console.debug(formatted, data ?? '');
        break;
      case 'info':
        console.info(formatted, data ?? '');
        break;
      case 'warn':
        console.warn(formatted, data ?? '');
        break;
      case 'error':
        console.error(formatted, data ?? '');
        break;
    }
  };

  return {
    debug: (message: string, data?: unknown) => log('debug', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    error: (message: string, data?: unknown) => log('error', message, data),
  };
}

export { createLogger };
export type { LogLevel, LogEntry };
