// ═══════════════════════════════════════════════════════
// CABBYS — Pricing Engine
// Reusable, DB-driven, fixed-price fare calculation.
// All values come from Supabase pricing_* tables (no hardcoding).
// ═══════════════════════════════════════════════════════
import { supabase } from "./supabase";

export interface PricingZone {
  zone_code: string;
  island: string;
  active: boolean;
}

export interface PricingLocation {
  name: string;
  zone_code: string;
  island?: string;
  active?: boolean;
}

export interface PricingRoute {
  from_name: string;
  to_name: string;
  price: number;
  bidirectional: boolean;
  island?: string;
  active?: boolean;
}

export interface PricingAddon {
  key: string;
  label: string;
  kind: "flat" | "percent" | "per_unit";
  amount: number;
  sort: number;
  island?: string;
  active?: boolean;
}

export interface PricingConfigRow {
  key: string;
  value: number;
  island?: string;
}

export interface Pricing {
  zones: PricingZone[];
  locations: PricingLocation[];
  routes: PricingRoute[];
  addons: PricingAddon[];
  config: Record<string, number>;
  loaded: boolean;
}

export interface LineItem {
  label: string;
  amount: number;
  kind: string;
  note?: string;
}

export interface FareResult {
  base: number;
  total: number;
  lineItems: LineItem[];
  source: string;
  currency?: string;
}

export interface ComputeFareOpts {
  pickup?: string;
  dropoff?: string;
  addonKeys?: string[];
  extraStops?: number;
  when?: Date | number;
  luxury?: boolean;
}

let _cache: Pricing | null = null;
let _cacheAt = 0;
const CACHE_MS = 60 * 1000; // re-read config at most once a minute

// Load all pricing configuration for an island (cached).
export async function loadPricing(island = "aruba", force = false): Promise<Pricing> {
  if (_cache && !force && Date.now() - _cacheAt < CACHE_MS) return _cache;
  const [zones, locations, routes, addons, config] = await Promise.all([
    supabase.from("pricing_zones").select("*").eq("island", island).eq("active", true),
    supabase.from("pricing_locations").select("*").eq("island", island).eq("active", true),
    supabase.from("pricing_routes").select("*").eq("island", island).eq("active", true),
    supabase.from("pricing_addons").select("*").eq("island", island).eq("active", true).order("sort"),
    supabase.from("pricing_config").select("*").eq("island", island),
  ]);
  const cfg: Record<string, number> = {};
  ((config.data as PricingConfigRow[]) || []).forEach((c) => { cfg[c.key] = Number(c.value); });
  _cache = {
    zones: (zones.data as PricingZone[]) || [],
    locations: (locations.data as PricingLocation[]) || [],
    routes: (routes.data as PricingRoute[]) || [],
    addons: (addons.data as PricingAddon[]) || [],
    config: cfg,
    loaded: !zones.error && !routes.error,
  };
  _cacheAt = Date.now();
  return _cache;
}

export function clearPricingCache(): void { _cache = null; _cacheAt = 0; }

const norm = (s: string | null | undefined): string => (s || "").trim().toLowerCase();

// Zones for user-typed (geocoded) addresses, registered at selection time.
const _customZones: Record<string, string> = {};
export function registerLocationZone(name: string, zoneCode: string): void {
  if (name && zoneCode) _customZones[norm(name)] = zoneCode;
}

// Resolve a place name to its zone code (A/B/C/D/AIRPORT) or null.
export function zoneForLocation(pricing: Pricing, name: string): string | null {
  if (!name) return null;
  if (norm(name).includes("airport")) return "AIRPORT";
  if (_customZones[norm(name)]) return _customZones[norm(name)];
  const exact = pricing.locations.find((l) => norm(l.name) === norm(name));
  if (exact) return exact.zone_code;
  const partial = pricing.locations.find(
    (l) => norm(name).includes(norm(l.name)) || norm(l.name).includes(norm(name))
  );
  return partial ? partial.zone_code : null;
}

// A name's "specific route" key — Airport collapses to "Airport".
const routeKey = (name: string): string => (norm(name).includes("airport") ? "airport" : norm(name));

function matchRoute(routes: PricingRoute[], fromKey: string, toKey: string): PricingRoute | undefined {
  return routes.find((r) => {
    const rf = norm(r.from_name), rt = norm(r.to_name);
    if (rf === fromKey && rt === toKey) return true;
    if (r.bidirectional && rf === toKey && rt === fromKey) return true;
    return false;
  });
}

// Find the fixed base price for a pickup → dropoff pair.
// Priority: specific named route → zone-to-zone matrix → min fare.
export function baseRoutePrice(
  pricing: Pricing,
  pickup: string | undefined,
  dropoff: string | undefined
): { price: number; source: "route" | "zone" | "min" } {
  const minFare = pricing.config.min_fare ?? 12;

  // 1. Specific named route (e.g. "Airport" → "Eagle Beach")
  const specific = matchRoute(pricing.routes, routeKey(pickup ?? ""), routeKey(dropoff ?? ""));
  if (specific) return { price: Number(specific.price), source: "route" };

  // 2. Zone-to-zone fallback (e.g. "ZONE:A" → "ZONE:B")
  const zFrom = zoneForLocation(pricing, pickup ?? "");
  const zTo = zoneForLocation(pricing, dropoff ?? "");
  if (zFrom && zTo) {
    const zoneRoute = matchRoute(pricing.routes, `zone:${norm(zFrom)}`, `zone:${norm(zTo)}`);
    if (zoneRoute) return { price: Number(zoneRoute.price), source: "zone" };
  }

  // 3. Minimum fare fallback
  return { price: minFare, source: "min" };
}

function isLateNight(pricing: Pricing, when: Date | number): boolean {
  const start = pricing.config.late_night_start ?? 23;
  const end = pricing.config.late_night_end ?? 5;
  const h = when instanceof Date ? when.getHours() : Number(when);
  if (isNaN(h)) return false;
  // window wraps midnight (e.g. 23 → 5)
  return start > end ? (h >= start || h < end) : (h >= start && h < end);
}

// ── MAIN: compute a full fare breakdown synchronously from loaded config ──
// opts: { pickup, dropoff, addonKeys:[], extraStops:0, when:Date, luxury:bool }
export function computeFare(pricing: Pricing, opts: ComputeFareOpts = {}): FareResult {
  const {
    pickup,
    dropoff,
    addonKeys = [],
    extraStops = 0,
    when = new Date(),
    luxury = false,
  } = opts;

  const minFare = pricing.config.min_fare ?? 12;
  const lineItems: LineItem[] = [];

  // Base route
  const base = baseRoutePrice(pricing, pickup, dropoff);
  let subtotal = base.price;
  lineItems.push({
    label: `${pickup || "Pickup"} → ${dropoff || "Destination"}`,
    amount: base.price,
    kind: "base",
    note: base.source === "min" ? "Minimum fare" : base.source === "zone" ? "Zone rate" : "Fixed route",
  });

  const addonByKey = (k: string): PricingAddon | undefined => pricing.addons.find((a) => a.key === k);

  // Flat & per-unit add-ons
  addonKeys.forEach((k) => {
    const a = addonByKey(k);
    if (!a) return;
    if (a.kind === "flat") {
      subtotal += Number(a.amount);
      lineItems.push({ label: a.label, amount: Number(a.amount), kind: "addon" });
    } else if (a.kind === "per_unit") {
      const qty = Math.max(1, extraStops || 1);
      const amt = Number(a.amount) * qty;
      subtotal += amt;
      lineItems.push({ label: `${a.label}${qty > 1 ? ` ×${qty}` : ""}`, amount: amt, kind: "addon" });
    }
  });

  // Percent multipliers (applied on running subtotal)
  // Luxury vehicle
  if (luxury) {
    const lux = addonByKey("luxury");
    if (lux) {
      const amt = Math.round(subtotal * (Number(lux.amount) / 100) * 100) / 100;
      subtotal += amt;
      lineItems.push({ label: `${lux.label} (+${lux.amount}%)`, amount: amt, kind: "multiplier" });
    }
  }

  // Late-night surcharge
  if (isLateNight(pricing, when)) {
    const ln = addonByKey("late_night");
    if (ln) {
      const amt = Math.round(subtotal * (Number(ln.amount) / 100) * 100) / 100;
      subtotal += amt;
      lineItems.push({ label: `${ln.label} (+${ln.amount}%)`, amount: amt, kind: "surcharge" });
    }
  }

  // Enforce minimum fare
  let total = subtotal;
  if (total < minFare) {
    lineItems.push({ label: "Minimum fare adjustment", amount: minFare - total, kind: "min" });
    total = minFare;
  }

  total = Math.round(total * 100) / 100;
  return { base: base.price, total, lineItems, currency: "$", source: base.source };
}

export function addTax(subtotalAwg: number, rate = 0.06): { tax: number; total: number } {
  const tax = Math.round(subtotalAwg * rate * 100) / 100;
  return { tax, total: Math.round((subtotalAwg + tax) * 100) / 100 };
}
