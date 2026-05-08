/**
 * Correlation ID utility for request/job tracing.
 * Propagates a unique ID through all log lines for end-to-end tracing.
 */

export function getCorrelationId(req?: Request): string {
  // Check for propagated correlation ID
  if (req) {
    const fromHeader = req.headers.get("x-correlation-id");
    if (fromHeader) return fromHeader;
  }
  // Generate new one
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface Logger {
  info: (msg: string, ...data: unknown[]) => void;
  warn: (msg: string, ...data: unknown[]) => void;
  error: (msg: string, ...data: unknown[]) => void;
}

function normalize(data: unknown[]): Record<string, unknown> {
  if (data.length === 0) return {};
  if (data.length === 1) {
    const d = data[0];
    if (d && typeof d === "object" && !Array.isArray(d)) {
      return d as Record<string, unknown>;
    }
    return { detail: d };
  }
  return { detail: data };
}

/**
 * Creates a structured logger that always includes correlation ID and function name.
 */
export function createLogger(functionName: string, correlationId: string): Logger {
  const base = { fn: functionName, cid: correlationId };

  return {
    info(msg: string, ...data: unknown[]) {
      console.log(JSON.stringify({ level: "info", msg, ...base, ...normalize(data), ts: new Date().toISOString() }));
    },
    warn(msg: string, ...data: unknown[]) {
      console.warn(JSON.stringify({ level: "warn", msg, ...base, ...normalize(data), ts: new Date().toISOString() }));
    },
    error(msg: string, ...data: unknown[]) {
      console.error(JSON.stringify({ level: "error", msg, ...base, ...normalize(data), ts: new Date().toISOString() }));
    },
  };
}
