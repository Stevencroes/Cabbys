// The dashboard's charts, as arithmetic.
//
// Every series a chart on this board draws is derived here, from the two
// reads the board already makes — the upcoming rides in <BoardProvider>
// and the four-month history loadRideHistory() returns — and from
// nothing else. There is no analytics table, no events stream and no
// cached aggregate, so nothing below may be read back from anywhere, and
// a chart that wants a number this file does not compute does not get to
// invent one in a component.
//
// MONEY GOES THROUGH ledger.ts, never around it. The weekly totals call
// total() and byDay(), the same two functions the Earnings screen and
// (through driverPayoutUsd) the driver's own screen are built on. A
// dashboard that bucketed revenue its own way would disagree with the
// money screen one click away, and the operator would stop trusting both.
//
// Three rules the shapes below exist to keep, each one a way a chart lies:
//
//  · A PARTIAL PERIOD IS MARKED. The current week has not finished, so
//    its bar is short by construction; drawn like the others it reads as
//    a collapse in trade. Every bucket that is still filling carries
//    `partial`, and the chart draws it differently and says so.
//  · A COMPARISON IS LIKE FOR LIKE. "Up 12%" compares seven COMPLETE days
//    with the seven before them. Today against last Thursday would set a
//    morning's takings against a whole day's and report a fall every
//    morning of the year.
//  · A TRUNCATED READ IS NOT A QUIET MONTH. When the history read comes
//    back at its row cap the oldest days are the ones missing, so the
//    window is cut to what was actually read (coveredFrom) instead of
//    drawing an empty stretch as if nothing had been booked.
import { addDays, arubaDayOf, weekStart } from "../../lib/datetime";
import type { DriverProfile } from "../../driver/lib/driver";
import { isClosed, isLive, needsDriver, type AdminRide } from "./admin";
import { byDay, total, totalOver } from "./ledger";

/* ── today, by state ─────────────────────────────────────────────────── */

export interface TodayMix {
  driven: number;
  live: number;
  /** has a driver (or is waiting on payment) and has not started */
  booked: number;
  /** nobody is driving it — the one with a deadline */
  open: number;
  cancelled: number;
  /** every ride dated today, the five above added up */
  all: number;
}

/**
 * Today's rides, each counted in exactly one bucket.
 *
 * The order of the checks is the order of precedence, and it matches
 * rideState() in ui.tsx: cancelled and completed are over whatever else
 * is true of them, and needsDriver comes before the in-flight statuses
 * because a confirmed ride with nobody on it is the row that matters.
 * The five always add up to `all`, so the donut can never draw a slice
 * the legend does not count.
 */
export function todayMix(rides: AdminRide[], today: string): TodayMix {
  const m: TodayMix = { driven: 0, live: 0, booked: 0, open: 0, cancelled: 0, all: 0 };
  for (const r of rides) {
    if (arubaDayOf(r.scheduledAt) !== today) continue;
    m.all += 1;
    if (r.status === "cancelled") m.cancelled += 1;
    else if (r.status === "completed") m.driven += 1;
    else if (needsDriver(r)) m.open += 1;
    else if (isLive(r)) m.live += 1;
    else m.booked += 1;
  }
  return m;
}

/* ── the days ahead ──────────────────────────────────────────────────── */

export interface DayLoad {
  day: string;
  /** still to drive, and somebody is down to drive it */
  covered: number;
  /** still to drive, and nobody is */
  open: number;
}

/**
 * What is still to be driven on each of the next `n` days, today first.
 *
 * Closed rides are left out — a completed ride at 7am is not part of
 * "how loaded is today", it is part of what today earned — and the split
 * is the one an operator plans staffing on: covered, and not.
 */
export function aheadByDay(rides: AdminRide[], today: string, n = 7): DayLoad[] {
  const out: DayLoad[] = Array.from({ length: n }, (_, i) => ({ day: addDays(today, i), covered: 0, open: 0 }));
  const at = new Map(out.map((d) => [d.day, d]));
  for (const r of rides) {
    if (isClosed(r)) continue;
    const slot = at.get(arubaDayOf(r.scheduledAt));
    if (!slot) continue;
    if (needsDriver(r)) slot.open += 1; else slot.covered += 1;
  }
  return out;
}

/* ── money over time ─────────────────────────────────────────────────── */

export interface WeekMoney {
  /** the Monday the week starts on */
  week: string;
  grossUsd: number;
  rides: number;
  /** the current week, still filling — drawn and labelled as such */
  partial: boolean;
}

/**
 * Completed revenue per week, oldest first, ending with the week today
 * is in. Weeks run Monday to Sunday, the same weeks the Earnings
 * screen's "This week" means.
 *
 * Weeks that start before `from` are dropped rather than drawn short:
 * a week the history read only half reached is not a slow week.
 */
export function weeklyMoney(rides: AdminRide[], today: string, weeks: number, from?: string): WeekMoney[] {
  const days = byDay(rides);
  const thisWeek = weekStart(today);
  const out: WeekMoney[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const week = addDays(thisWeek, -7 * i);
    if (from && week < from) continue;
    const span = Array.from({ length: 7 }, (_, d) => addDays(week, d));
    const t = totalOver(span, days);
    out.push({ week, grossUsd: t.grossUsd, rides: t.rides, partial: i === 0 });
  }
  return out;
}

export interface DayCount {
  day: string;
  rides: number;
}

/**
 * Rides per day over the `days` COMPLETE days ending yesterday, oldest
 * first. A ride counts on the day it was booked FOR, cancelled ones
 * excepted — this is how busy the island kept the fleet, not what it
 * earned, which is the weekly chart's question.
 */
export function dailyRides(rides: AdminRide[], today: string, days: number, from?: string): DayCount[] {
  const counts = new Map<string, number>();
  for (const r of rides) {
    if (r.status === "cancelled") continue;
    const d = arubaDayOf(r.scheduledAt);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: DayCount[] = [];
  for (let i = days; i >= 1; i--) {
    const day = addDays(today, -i);
    if (from && day < from) continue;
    out.push({ day, rides: counts.get(day) ?? 0 });
  }
  return out;
}

export interface Period {
  grossUsd: number;
  rides: number;
}

export interface Trend {
  current: Period;
  previous: Period;
  /** change in revenue as a fraction (0.12 = +12%), or null when the
      previous period earned nothing and a percentage would be infinite */
  change: number | null;
  /** false when the history read did not reach back far enough to see
      the whole previous period — the comparison is then withheld */
  comparable: boolean;
}

/**
 * The `days` complete days ending yesterday, against the `days` before
 * them. Complete days on both sides, so the comparison is like for like
 * at any hour it is read.
 */
export function trailing(rides: AdminRide[], today: string, days: number, from?: string): Trend {
  const m = byDay(rides);
  const span = (endExclusive: string) => Array.from({ length: days }, (_, i) => addDays(endExclusive, i - days));
  const cur = totalOver(span(today), m);
  const prevStart = addDays(today, -2 * days);
  const prev = totalOver(span(addDays(today, -days)), m);
  return {
    current: { grossUsd: cur.grossUsd, rides: cur.rides },
    previous: { grossUsd: prev.grossUsd, rides: prev.rides },
    change: prev.grossUsd > 0 ? (cur.grossUsd - prev.grossUsd) / prev.grossUsd : null,
    comparable: !from || prevStart >= from,
  };
}

/**
 * The first day the history read can be trusted from.
 *
 * Below the row cap, the read reached the whole window it asked for and
 * this is just `requested`. AT the cap, the oldest rows are the ones that
 * were cut, so the earliest day that came back may itself be partial —
 * the window starts the day after it.
 */
export function coveredFrom(history: AdminRide[], limit: number, requested: string): string {
  if (history.length < limit) return requested;
  let oldest = "";
  for (const r of history) {
    const d = arubaDayOf(r.scheduledAt);
    if (d && (!oldest || d < oldest)) oldest = d;
  }
  return oldest ? addDays(oldest, 1) : requested;
}

/** Today's completed money — the figure the dashboard has always led with. */
export function earnedOnDay(rides: AdminRide[], day: string) {
  return total(byDay(rides).get(day) ?? []);
}

/* ── the fleet ───────────────────────────────────────────────────────── */

export interface FleetMix {
  approved: number;
  pending: number;
  suspended: number;
  /** approved drivers who are on duty or already holding a live ride */
  onDuty: number;
}

/**
 * Who could drive, and who is.
 *
 * "On duty" is drivers.is_online OR a ride in progress. The flag alone
 * would undercount: a driver who switched themselves off mid-ride is
 * still in a car with a guest in it, and a utilisation figure that
 * dropped them would understate the one number it exists to state.
 */
export function fleetMix(drivers: DriverProfile[], rides: AdminRide[]): FleetMix {
  const driving = new Set(rides.filter(isLive).map((r) => r.driverId).filter(Boolean) as string[]);
  const m: FleetMix = { approved: 0, pending: 0, suspended: 0, onDuty: 0 };
  for (const d of drivers) {
    m[d.status] += 1;
    if (d.status === "approved" && (d.isOnline || driving.has(d.id))) m.onDuty += 1;
  }
  return m;
}
