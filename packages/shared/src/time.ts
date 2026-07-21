/** Europe/London wall-clock helpers. All send-safety checks use these, never server-local time. */

const LONDON = "Europe/London";

export interface LondonClock {
  now(): Date;
}

export const systemClock: LondonClock = { now: () => new Date() };

interface LondonParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 1 = Monday ... 7 = Sunday
}

export function londonParts(date: Date): LondonParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday ?? ""] ?? 0,
  };
}

/** YYYY-MM-DD in Europe/London — the canonical "run date". */
export function londonDateString(date: Date): string {
  const p = londonParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function isLondonWeekday(date: Date): boolean {
  const w = londonParts(date).weekday;
  return w >= 1 && w <= 5;
}

export function isWithinLondonHours(date: Date, startHour: number, endHourInclusive: number): boolean {
  const h = londonParts(date).hour;
  return h >= startHour && h <= endHourInclusive;
}

/**
 * Pick a pseudo-random send time within the window on the given London day.
 * `seed` makes selection deterministic per prospect (auditable, testable).
 */
export function pickSendTime(
  runDate: string,
  startHour: number,
  endHourInclusive: number,
  seed: string,
): { hour: number; minute: number } {
  let h = 2166136261;
  const s = `${runDate}:${seed}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.abs(h);
  const span = endHourInclusive - startHour + 1;
  return { hour: startHour + (n % span), minute: (n >> 5) % 60 };
}
