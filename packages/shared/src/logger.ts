/** Structured JSON logger. One line per event, machine-parseable, no secrets. */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = /(api[_-]?key|token|secret|password|authorization)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(
  minLevel: LogLevel = "info",
  bindings: Record<string, unknown> = {},
  sink: (line: string) => void = (line) => process.stdout.write(line + "\n"),
): Logger {
  const emit = (level: LogLevel, msg: string, ctx?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    sink(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        ...(redact(bindings) as Record<string, unknown>),
        ...(ctx ? (redact(ctx) as Record<string, unknown>) : {}),
      }),
    );
  };
  return {
    debug: (m, c) => emit("debug", m, c),
    info: (m, c) => emit("info", m, c),
    warn: (m, c) => emit("warn", m, c),
    error: (m, c) => emit("error", m, c),
    child: (extra) => createLogger(minLevel, { ...bindings, ...extra }, sink),
  };
}
