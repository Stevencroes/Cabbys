// §3.6 — derived pickup times. The guest knows their flight, not the
// dispatch maths; the form reshapes itself around the route.

/** "HH:MM" + minutes → "HH:MM" (wraps midnight). */
export function shiftTime(hhmm: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let total = (+m[1] * 60 + +m[2] + minutes + 1440) % 1440;
  const h = Math.floor(total / 60), mm = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Arrival: driver is inside arrivals 30 minutes after scheduled landing. */
export const ARRIVAL_BUFFER_MIN = 30;
export function driverWaitsFrom(landing: string): string {
  return shiftTime(landing, ARRIVAL_BUFFER_MIN);
}

/** Departure lead: Aruba pre-clears US immigration on the island → 3 h. */
export const LEAD_US_MIN = 180;
export const LEAD_INTL_MIN = 135; // 2h15 everywhere else
export function collectAt(departure: string, flyingToUS: boolean): string {
  return shiftTime(departure, -(flyingToUS ? LEAD_US_MIN : LEAD_INTL_MIN));
}

/** Rides inside 3 hours need a human (§3.6) — shown, never blocking. */
export const MIN_NOTICE_MS = 3 * 3_600_000;
export function insideMinNotice(date: string, time: string, now: Date = new Date()): boolean {
  if (!date || !time) return false;
  const d = new Date(`${date}T${time}:00`);
  if (isNaN(d.getTime())) return false;
  const delta = d.getTime() - now.getTime();
  return delta > -12 * 3_600_000 && delta < MIN_NOTICE_MS;
}
