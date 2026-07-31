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
}

const isAirport = (s: PlaceSel) => s.id === AIRPORT_ID;

/** Base one-way fare in USD for the standard car, before vehicle class. */
function legBaseUsd(from: PlaceSel, to: PlaceSel, pricing: Pricing | null): { base: number; source: "engine" | "model" } {
  // 1 — live rate card (catalog names match pricing_locations/routes rows;
  //     custom addresses never match and fall through to the model)
  if (pricing?.loaded && !from.custom && !to.custom) {
    const r = computeFare(pricing, { pickup: from.name, dropoff: to.name });
    if (r.source !== "min") {
      return { base: (r.total * (1 + TAX_RATE)) / AWG_PER_USD, source: "engine" };
    }
  }
  // 2 — signed-km model (all-in USD)
  const dist = Math.abs(from.km - to.km);
  const base = Math.max(28, Math.round(22 + dist * 1.4));
  return { base: Math.max(base, from.mf || 0, to.mf || 0), source: "model" };
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
}

export function quote({ from, to, vehicle, isReturn, pricing }: QuoteInput): Quote {
  const { base, source } = legBaseUsd(from, to, pricing);
  // Vehicle class scales the leg (the rate card's shape), rounded ONCE so
  // hero, vehicle rows and review can never drift by a cent.
  const oneWayUsd = Math.round(base * vehicle.mult);
  return {
    oneWayUsd,
    totalUsd: oneWayUsd * (isReturn ? 2 : 1),
    minutes: legDuration(from, to),
    source,
  };
}

/** AWG value stored on the ride row (driver dashboard reads florin). */
export function usdToAwg(usdAmount: number): number {
  return Math.round(usdAmount * AWG_PER_USD * 100) / 100;
}
