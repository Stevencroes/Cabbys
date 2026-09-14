// The money, read off the rides.
//
// Every figure the Earnings screen shows is derived here, and derived
// ONCE, from the two numbers this company actually owns: the fare
// stored on the ride in florin, and COMMISSION_RATE. There is no
// payouts table, no invoices, no ledger — so nothing below is read
// back from anywhere, and nothing below may be re-derived in a
// component.
//
// That last rule is not tidiness. The DRIVER's own Earnings screen
// (src/driver/screens/Earnings.tsx) already does this arithmetic for
// one driver, through driverPayoutUsd() and COMMISSION_RATE. If the
// operator's board computed a payout a different way — rounding at a
// different point, bucketing by a different date — the two screens
// would disagree about what a driver is owed, and the driver's is the
// one they would believe. So this file calls the same functions, and
// buckets by the same day: completed_at, falling back to the scheduled
// time, read on Aruba's clock. A job booked Friday and driven Saturday
// is Saturday's money on both screens.
//
// COMPLETED WORK ONLY. A confirmed booking for next Tuesday is not
// revenue, it is a promise, and a revenue figure that counts promises
// is the figure that makes a company feel richer than it is. Today's
// number therefore grows through the day rather than starting full,
// which is correct and is said on the screen so nobody reads a quiet
// morning as a broken query.
//
// REFUNDS ARE NOT HERE, because they are nowhere. There is no
// server-side Stripe path in this project that refunds or voids
// anything (see admin_cancel_ride in docs/admin-schema.sql), so a
// refunds line would be a permanent zero pretending to be a
// measurement. A cancelled ride with money still held against it is
// reported by name on the attention list instead, which is a job
// somebody can do, rather than a total nobody can trust.
import { isClosed, type AdminRide } from "./admin";
import { awgToUsd, COMMISSION_RATE, driverPayoutUsd } from "../../lib/quote";
import { arubaDayOf } from "../../lib/datetime";

export interface Money {
  /** what the guests were charged, in USD */
  grossUsd: number;
  /** what the drivers are owed out of it */
  payoutUsd: number;
  /** what is left for Cabby's — derived by subtraction, never by a
      second multiplication, so the three lines cannot fail to add up */
  feeUsd: number;
  /** how many completed rides made it */
  rides: number;
}

export const EMPTY_MONEY: Money = { grossUsd: 0, payoutUsd: 0, feeUsd: 0, rides: 0 };

/**
 * The day a ride's money belongs to, on Aruba's clock.
 *
 * completed_at first, because that is when the work was done. The
 * scheduled time is the fallback for a ride completed before that
 * column existed — those rows are real money and dropping them would
 * make an old month quietly shrink.
 */
export function earnedOn(r: AdminRide): string {
  return arubaDayOf(r.completedAt ?? r.scheduledAt);
}

/** Every completed ride, filed under the day it earned. */
export function byDay(rides: AdminRide[]): Map<string, AdminRide[]> {
  const m = new Map<string, AdminRide[]>();
  for (const r of rides) {
    if (r.status !== "completed") continue;
    const d = earnedOn(r);
    if (!d) continue;
    const list = m.get(d);
    if (list) list.push(r); else m.set(d, [r]);
  }
  return m;
}

/** What a set of completed rides came to. */
export function total(rides: AdminRide[]): Money {
  let grossUsd = 0;
  let payoutUsd = 0;
  let count = 0;
  for (const r of rides) {
    if (r.status !== "completed" || r.fareAwg == null) continue;
    grossUsd += awgToUsd(r.fareAwg);
    payoutUsd += driverPayoutUsd(r.fareAwg);
    count += 1;
  }
  return { grossUsd, payoutUsd, feeUsd: grossUsd - payoutUsd, rides: count };
}

/** The same sum, over a named set of days. */
export function totalOver(days: string[], m: Map<string, AdminRide[]>): Money {
  return total(days.flatMap((d) => m.get(d) ?? []));
}

/** The share Cabby's keeps, as the screen states it — from the constant
    rather than from a total, so a quiet day still shows the rate. */
export const COMMISSION_LABEL = `${Math.round(COMMISSION_RATE * 100)}%`;

/**
 * One line of the transaction table.
 *
 * Deliberately not a new type with its own copies of the numbers: it
 * carries the ride, so clicking a row can open the ride it is about
 * and nothing has to be matched back up by id.
 */
export interface Line {
  ride: AdminRide;
  grossUsd: number;
  payoutUsd: number;
  feeUsd: number;
}

export function lines(rides: AdminRide[]): Line[] {
  return rides
    .filter((r) => r.status === "completed" && r.fareAwg != null)
    .sort((a, b) => String(b.completedAt ?? b.scheduledAt ?? "").localeCompare(String(a.completedAt ?? a.scheduledAt ?? "")))
    .map((r) => {
      const grossUsd = awgToUsd(r.fareAwg as number);
      const payoutUsd = driverPayoutUsd(r.fareAwg as number);
      return { ride: r, grossUsd, payoutUsd, feeUsd: grossUsd - payoutUsd };
    });
}

/**
 * What is booked but not yet earned, over the days ahead.
 *
 * Kept strictly apart from the totals above and labelled as what it is.
 * An operator does want to know what next week is worth — that is how
 * you decide whether to chase drivers — but it must never be added to
 * revenue, so it does not share a type with it.
 */
export function booked(rides: AdminRide[]): { usd: number; rides: number } {
  let usd = 0;
  let count = 0;
  for (const r of rides) {
    if (isClosed(r) || r.fareAwg == null) continue;
    usd += awgToUsd(r.fareAwg);
    count += 1;
  }
  return { usd, rides: count };
}
