// ─────────────────────────────────────────────────────────────────────
// Dates and times, stated the same way for every visitor.
//
// A native <input type="date"> renders in the VISITOR's locale, so the
// same booking reads 07/08/2026 to an American (7 Aug) and to a Dutch
// guest (7 Aug vs Aug 7 depending on the field). A driver at the airport
// on the wrong day is the most expensive failure this site can produce,
// so nothing here goes through toLocaleDateString: month and day names
// are fixed English, and every rendered date carries its weekday.
//
// Aruba runs Atlantic Standard Time (UTC−4) all year — no daylight
// saving — so the offset is a constant, not a lookup.
// ─────────────────────────────────────────────────────────────────────

export const ARUBA_OFFSET_MINUTES = -240; // UTC−4, year-round
export const ARUBA_TZ_LABEL = "Aruba time (AST)";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_INITIALS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isIsoDate(v: string): boolean {
  return ISO_DATE.test(v) && !Number.isNaN(dateParts(v).getTime());
}
export function isHhmm(v: string): boolean {
  return HHMM.test(v);
}

/** Anchor an ISO date at noon UTC so day arithmetic can never slip a day. */
function dateParts(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Today on the island, whatever the browser's clock is set to. */
export function todayInAruba(now: number = Date.now()): string {
  return new Date(now + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** The current wall-clock time on the island, as "HH:MM". */
export function nowInAruba(now: number = Date.now()): string {
  return new Date(now + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16);
}

/** "2026-08-07" → "Fri 7 Aug 2026". Identical under every browser locale. */
export function formatDate(iso: string): string {
  if (!isIsoDate(iso)) return "";
  const d = dateParts(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Shorter form for tight rows: "Fri 7 Aug". */
export function formatDateShort(iso: string): string {
  if (!isIsoDate(iso)) return "";
  const d = dateParts(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "14:35" → "2:35 PM". Always explicit, never bare 24-hour. */
export function formatTime(hhmm: string): string {
  const m = HHMM.exec(hhmm.trim());
  if (!m) return "";
  const h24 = +m[1];
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** "Fri 7 Aug 2026 · 2:35 PM" — the one way a moment is written. */
export function formatDateTime(iso: string, hhmm: string): string {
  const d = formatDate(iso);
  const t = formatTime(hhmm);
  return [d, t].filter(Boolean).join(" · ");
}

// ── 12-hour ⇄ 24-hour, for the time picker's three controls ──
export interface Clock12 {
  hour: number;      // 1–12
  minute: number;    // 0–59
  meridiem: "AM" | "PM";
}

export function to12Hour(hhmm: string): Clock12 | null {
  const m = HHMM.exec(hhmm.trim());
  if (!m) return null;
  const h24 = +m[1];
  return {
    hour: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: +m[2],
    meridiem: h24 < 12 ? "AM" : "PM",
  };
}

export function to24Hour({ hour, minute, meridiem }: Clock12): string {
  const h24 = meridiem === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ── calendar helpers ──
export function addDays(iso: string, days: number): string {
  const d = dateParts(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const d = dateParts(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function monthLabel(iso: string): string {
  const d = dateParts(iso);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Six weeks of ISO dates covering the month `iso` falls in, Sunday-first. */
export function monthGrid(iso: string): string[] {
  const d = dateParts(iso);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => {
    const cell = new Date(start);
    cell.setUTCDate(start.getUTCDate() + i);
    return cell.toISOString().slice(0, 10);
  });
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function dayOfMonth(iso: string): number {
  return dateParts(iso).getUTCDate();
}

/**
 * A wall-clock moment on the island → a fixed UTC instant.
 * Persisting `new Date(`${date}T${time}`)` would read the string in the
 * BROWSER's timezone, so the same booking would store a different instant
 * depending on where it was made. Anchoring to −04:00 removes the drift.
 */
export function arubaInstant(date: string, time: string): string {
  const t = isHhmm(time) ? time : "00:00";
  return new Date(`${date}T${t}:00-04:00`).toISOString();
}
