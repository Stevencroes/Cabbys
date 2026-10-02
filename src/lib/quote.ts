// ─────────────────────────────────────────────────────────────────────
// ONE pricing function, no surprises.
// The number on the hero card, on every vehicle row, and in the review
// is always the SAME number, because they all come from here.
//
// Fare resolution per leg:
//   1. The Supabase pricing engine (the live rate card) when it has a
//      matching route/zone row — this is the authority.
//   2. Otherwise the signed-km model:
//        base = max(28, 22 + |from.km − to.km| × 1.4)  → floors mf apply
//      Constants follow the v3 spec shape; tune against the rate card.
//
// The UI is USD-only. AWG exists ONLY here, at the boundary with the
// engine (whose tables are florin-denominated) and the rides payload.
//
// Child seats are priced here too, after the leg and outside it. They
// used to be free — the stepper added seats and no number anywhere
// moved — and when the owner set a price, the one rule above is why it
// lives in this file and not in the screen that sells it: a seat charge
// added in Step2Car alone would have put one total on the vehicle rows
// and another in the review and the stored fare.
// ─────────────────────────────────────────────────────────────────────
import { computeFare, type Pricing } from "./pricing";
import { AIRPORT_ID, type PlaceSel } from "../data/places";
import type { Vehicle } from "../data/vehicles";

/** Engine tables are AWG; never surfaces in the UI. */
export const AWG_PER_USD = 1.79;
const TAX_RATE = 0.06; // government & facility tax — always included

/**
 * What one child seat costs, per seat, per one-way ride, in US dollars.
 *
 * Set by the owner. All in: no tax goes on top, so the guest pays exactly
 * the number shown. A return booking carries the seat both ways and pays
 * for it both ways — one seat on a return is twice this.
 *
 * It is a flat dollar amount, deliberately NOT a pricing_addons row run
 * through computeFare: that path is florin-denominated, taxed and scaled
 * by the vehicle class, and every one of those would have turned "$10" on
 * the screen into some other number on the bill. api/booking-alerts.ts
 * keeps a copy, held equal by src/server/bookingAlerts.test.ts.
 */
export const CHILD_SEAT_USD = 10;

/** Child seats carried on one run. A third belongs in a second car, and
    a stepper that counts to three would promise one we cannot fit. The
    FAQ says "up to two"; Landing.test pins it. */
export const MAX_CHILD_SEATS = 2;

/** The single money formatter (§3.9). */
export const usd = (n: number): string => "$" + Math.round(n);

export interface Quote {
  /** one-way RIDE fare, selected vehicle, all-in USD — no seats */
  oneWayUsd: number;
  /** child seats, every leg, all-in USD (0 when none) */
  seatsUsd: number;
  /** ride × legs + seats — the number shown EVERYWHERE, and stored */
  totalUsd: number;
  minutes: number;
  source: "engine" | "model";
  /** true when the rate card's night window put a surcharge on this fare */
  lateNight: boolean;
}

const isAirport = (s: PlaceSel) => s.id === AIRPORT_ID;

/**
 * The name the rate card is asked about for one end of a leg.
 *
 * A catalog place answers with its own name, which is canonical and
 * matches pricing_locations rows by construction. A CUSTOM selection —
 * a geocoded address, or one typed into the manual fallback — answers
 * with its AREA instead, and never with what the traveller typed.
 *
 * That distinction is the whole point. pricing.ts matches location names
 * by loose substring in both directions, so letting arbitrary text reach
 * it is how "Villa Bucuti 3" starts pricing as the Bucuti resort. An area
 * name is one of ten strings this app owns, and for a geocoded address it
 * was chosen from COORDINATES (nearestArea in data/places.ts), not from
 * spelling — so it is both safe to match and more trustworthy than the
 * text would have been.
 *
 * Custom selections used to skip the rate card entirely and go straight to
 * the km model, which priced a typed "Manchebo Beach Resort" 38% above the
 * same hotel picked from the list. Same car, same road, two prices.
 */
const fareName = (s: PlaceSel): string => (s.custom ? s.area : s.name);

/**
 * The hour the fare is priced against when no pickup time has been chosen.
 *
 * computeFare's `when` defaulted to `new Date()`, which meant the engine's
 * late-night window was tested against the CLOCK IN THE BROWSER rather than
 * the hour of the ride. Quoting the same airport run at 01:00 in Amsterdam
 * and at 14:00 in Aruba returned two different prices for one journey, and
 * neither of them had anything to do with when the car was needed. Midday is
 * the neutral answer for "we haven't been told yet": it is inside no window.
 */
const NEUTRAL_HOUR = 12;

/** Base one-way fare in USD for the standard car, before vehicle class. */
function legBaseUsd(
  from: PlaceSel,
  to: PlaceSel,
  pricing: Pricing | null,
  hour: number,
): { base: number; source: "engine" | "model"; lateNight: boolean } {
  // 1 — live rate card. Catalog names match pricing_locations/routes rows
  //     directly; a custom address is asked about by its area (fareName).
  //     Anything the card has no row for still falls through to the model.
  if (pricing?.loaded) {
    const r = computeFare(pricing, { pickup: fareName(from), dropoff: fareName(to), when: hour });
    if (r.source !== "min") {
      return {
        base: (r.total * (1 + TAX_RATE)) / AWG_PER_USD,
        source: "engine",
        lateNight: r.lineItems.some((l) => l.kind === "surcharge"),
      };
    }
  }
  // 2 — signed-km model (all-in USD). No time-of-day component at all, which
  //     is why a route can price differently before the rate card loads.
  const dist = Math.abs(from.km - to.km);
  const base = Math.max(28, Math.round(22 + dist * 1.4));
  return { base: Math.max(base, from.mf || 0, to.mf || 0), source: "model", lateNight: false };
}

/**
 * The hour, in Aruba, that a "HH:MM" pickup time falls on.
 * Aruba is UTC−4 year-round with no daylight saving, so the string already
 * IS local time — no Date is built, and nothing here can drift with the
 * viewer's own timezone.
 */
export function arubaHour(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const h = Number(hhmm.slice(0, 2));
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
}

export function legDuration(from: PlaceSel, to: PlaceSel): number {
  let mins: number;
  if (isAirport(from)) mins = to.min ?? 20;
  else if (isAirport(to)) mins = from.min ?? 20;
  else mins = Math.max(10, Math.round(Math.abs(from.km - to.km) * 1.4) + 6);
  return Math.max(mins, from.md || 0, to.md || 0);
}

export interface QuoteInput {
  from: PlaceSel;
  to: PlaceSel;
  vehicle: Vehicle;
  isReturn: boolean;
  pricing: Pricing | null;
  /** Pickup time as "HH:MM" in Aruba. Omit while it is still unknown. */
  pickupTime?: string | null;
  /** Child seats on the booking. Omitted (the Fleet section, which
      prices a car before anyone has said who is coming) means none. */
  seats?: number;
}

/** The seat charge for a booking: per seat, per leg. Clamped to what one
    car carries, so no input can price a seat we would not bring. */
export function seatsUsd(seats: number | undefined, isReturn: boolean): number {
  const n = Math.max(0, Math.min(MAX_CHILD_SEATS, Math.floor(seats ?? 0)));
  return n * CHILD_SEAT_USD * (isReturn ? 2 : 1);
}

export function quote({ from, to, vehicle, isReturn, pricing, pickupTime, seats }: QuoteInput): Quote {
  const { base, source, lateNight } = legBaseUsd(from, to, pricing, arubaHour(pickupTime) ?? NEUTRAL_HOUR);
  // Vehicle class scales the leg (the rate card's shape), rounded ONCE so
  // hero, vehicle rows and review can never drift by a cent.
  const oneWayUsd = Math.round(base * vehicle.mult);
  const seatCharge = seatsUsd(seats, isReturn);
  return {
    oneWayUsd,
    seatsUsd: seatCharge,
    totalUsd: oneWayUsd * (isReturn ? 2 : 1) + seatCharge,
    minutes: legDuration(from, to),
    source,
    lateNight,
  };
}

/** AWG value stored on the ride row (driver dashboard reads florin). */
export function usdToAwg(usdAmount: number): number {
  return Math.round(usdAmount * AWG_PER_USD * 100) / 100;
}

/**
 * The two fare columns a booking writes, from the quote the guest saw.
 *
 * fare_total is the guest's whole bill — seats included — because it is
 * what everything downstream reads as "the fare": the emails, My trips,
 * the driver portal and, when card payment is on, the amount
 * create-payment-intent charges. fare_base stays the one-way ride alone.
 * One function so the review and the row cannot disagree; quote.test
 * holds awgToUsd(fareTotal) to the total on screen.
 */
export function storedFare(q: Pick<Quote, "oneWayUsd" | "totalUsd">): { fareBase: number; fareTotal: number } {
  return { fareBase: usdToAwg(q.oneWayUsd), fareTotal: usdToAwg(q.totalUsd) };
}

/** Back the other way — the ride row stores florin, drivers are shown USD. */
export function awgToUsd(awgAmount: number): number {
  return awgAmount / AWG_PER_USD;
}

/**
 * Cabby's share of a fare.
 *
 * The number the whole fare model is built backwards from: every rate card
 * row is set so that what is LEFT after this still clears what a taxi pays
 * the same driver for the same road. Change it and every fare has to be
 * re-derived, which is why it lives here beside the fare and not in a
 * component.
 *
 * It belongs in pricing_config eventually, alongside min_fare and the
 * late-night window, so it can move without a deploy. It is a constant for
 * now because a half-wired config read that never fires is worse than an
 * honest constant.
 */
export const COMMISSION_RATE = 0.25;

/**
 * What the driver actually receives, in USD, from a fare stored in florin.
 *
 * This exists because the driver portal had no concept of it. Every screen
 * showed `fare_total` — the CUSTOMER's fare, in florin — under a dollar
 * sign, and the earnings screen called it "Net earned". Two errors stacked
 * the same way: a $51 ride was stored as ƒ91 and displayed to the driver as
 * "$91", against a true payout of $38.25. Nothing in the app could have
 * caught it, because nothing in the app knew what a driver was owed.
 */
export function driverPayoutUsd(fareTotalAwg: number, seatUsd = 0): number {
  const fareUsd = awgToUsd(fareTotalAwg);
  // Child seat money goes to the driver whole: the driver carries the
  // seat, fits it to the child's age and cleans it, and the commission
  // pays for finding the ride, which the seat adds nothing to. Clamped to
  // the fare, so a row whose fare predates the seat charge can never pay
  // out more than the guest was asked for.
  const seat = Math.min(Math.max(0, seatUsd), fareUsd);
  return (fareUsd - seat) * (1 - COMMISSION_RATE) + seat;
}

/**
 * The seat money inside a stored ride's fare: per seat, per leg, the same
 * rule quote() charged it by. A return is one ride row carrying both legs,
 * marked by return_date. Reads the raw row, so the driver portal and the
 * admin board work it out from the same columns.
 */
export function rowSeatsUsd(row: { child_seats?: unknown; return_date?: unknown }): number {
  const n = Number(row.child_seats);
  return seatsUsd(Number.isFinite(n) ? n : 0, typeof row.return_date === "string" && row.return_date !== "");
}
