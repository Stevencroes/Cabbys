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
// ─────────────────────────────────────────────────────────────────────
import { computeFare, type Pricing } from "./pricing";
import { AIRPORT_ID, type PlaceSel } from "../data/places";
import type { Vehicle } from "../data/vehicles";

/** Engine tables are AWG; never surfaces in the UI. */
export const AWG_PER_USD = 1.79;
const TAX_RATE = 0.06; // government & facility tax — always included

/** The single money formatter (§3.9). */
export const usd = (n: number): string => "$" + Math.round(n);

export interface Quote {
  /** one-way, selected vehicle, all-in USD */
  oneWayUsd: number;
  /** doubled when return — the number shown EVERYWHERE */
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
}

export function quote({ from, to, vehicle, isReturn, pricing, pickupTime }: QuoteInput): Quote {
  const { base, source, lateNight } = legBaseUsd(from, to, pricing, arubaHour(pickupTime) ?? NEUTRAL_HOUR);
  // Vehicle class scales the leg (the rate card's shape), rounded ONCE so
  // hero, vehicle rows and review can never drift by a cent.
  const oneWayUsd = Math.round(base * vehicle.mult);
  return {
    oneWayUsd,
    totalUsd: oneWayUsd * (isReturn ? 2 : 1),
    minutes: legDuration(from, to),
    source,
    lateNight,
  };
}

/** AWG value stored on the ride row (driver dashboard reads florin). */
export function usdToAwg(usdAmount: number): number {
  return Math.round(usdAmount * AWG_PER_USD * 100) / 100;
}
