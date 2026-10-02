// §3.6 — derived pickup times. The guest knows their flight, not the
// dispatch maths; the form reshapes itself around the route.
import { addDays, arubaInstant, isHhmm, isIsoDate } from "./datetime";

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

/** Departure lead: Aruba pre-clears US immigration on the island → 3 h
    AT THE AIRPORT. */
export const LEAD_US_MIN = 180;
export const LEAD_INTL_MIN = 135; // 2h15 everywhere else

/**
 * When the car collects a guest flying out: the airport lead plus the
 * drive, back from take-off.
 *
 * It used to take off the lead alone, while the form said "you need 3
 * hours at the airport. We've worked backwards…" — so a guest 30 minutes
 * away was collected 3 hours before take-off and walked into the terminal
 * at 2½. The owner: take off the drive time too.
 */
export function collectAt(departure: string, flyingToUS: boolean, driveMinutes = 0): string {
  return shiftTime(departure, -collectLeadMinutes(flyingToUS, driveMinutes));
}

function collectLeadMinutes(flyingToUS: boolean, driveMinutes: number): number {
  return (flyingToUS ? LEAD_US_MIN : LEAD_INTL_MIN) + Math.max(0, Math.round(driveMinutes));
}

/**
 * The collection DATE, for a flight on `date`. Working back from a
 * take-off just after midnight lands on the evening before — a 01:30
 * flight to the US, 25 minutes away, is collected at 22:05 the day
 * before. shiftTime wraps the clock but knows nothing of dates, so the
 * ride was stored for 22:05 on the flight's own date: a whole day after
 * the plane had gone.
 */
export function collectDate(date: string, departure: string, flyingToUS: boolean, driveMinutes = 0): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(departure.trim());
  if (!m || !isIsoDate(date)) return date;
  return +m[1] * 60 + +m[2] - collectLeadMinutes(flyingToUS, driveMinutes) < 0 ? addDays(date, -1) : date;
}

/**
 * A span of minutes as a person says it: "3 hours", "2 hours 15 minutes",
 * "1 hour", "45 minutes".
 *
 * For copy that states one of the numbers in this file. The landing page
 * and the FAQ used to type "two hours" and "3 hours" out by hand beside
 * the constants that decide them, and a number typed next to its constant
 * is a number that stops matching it the day the owner changes one.
 * confirmWindowLabel (policy.ts) only speaks whole hours or bare minutes,
 * and LEAD_INTL_MIN is 135, which it would read out as "135 minutes".
 */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? "1 hour" : `${h} hours`;
  const mins = m === 1 ? "1 minute" : `${m} minutes`;
  if (!h) return mins;
  return m ? `${hours} ${mins}` : hours;
}

// ── Minimum lead time ────────────────────────────────────────────────
// Two hours, set by the owner (it was a 3-hour placeholder). Change
// MIN_NOTICE_HOURS and every message and check on the site follows; the
// email's copy in api/booking-alerts.ts is held equal by a test.
export const MIN_NOTICE_HOURS = 2;
/**
 * Rides inside the window are shown a notice but are NOT blocked: a late
 * booking is still a booking, and the dispatcher confirms it by hand.
 */
export const MIN_NOTICE_MS = MIN_NOTICE_HOURS * 3_600_000;

/**
 * Whether a pickup is inside the minimum notice, measured on ARUBA's clock.
 *
 * The date and time a guest picks are island time. This used to read them
 * with `new Date(`${date}T${time}:00`)`, which takes the string in the
 * BROWSER's timezone — the fault bookingPayload.ts and arubaInstant exist
 * to avoid, left standing here. A guest in the Netherlands, six hours
 * ahead, booking at noon for 8 PM was told the ride needed a human; one in
 * California, three hours behind, booking at noon for 2 PM was not. Most
 * guests book from home, before they fly, so most guests were on the
 * wrong side of it.
 */
export function insideMinNotice(date: string, time: string, now: Date = new Date()): boolean {
  // arubaInstant turns a bad time into midnight and throws on a bad date;
  // a half-typed field here should mean "no notice yet", not either.
  if (!isIsoDate(date) || !isHhmm(time)) return false;
  const delta = Date.parse(arubaInstant(date, time)) - now.getTime();
  return delta > -12 * 3_600_000 && delta < MIN_NOTICE_MS;
}
