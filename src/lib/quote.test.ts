import { describe, it, expect } from "vitest";
import { quote, legDuration, usd, arubaHour } from "./quote";
import type { Pricing } from "./pricing";
import { placeById, selFromPlace, selFromCustom, areaByName, AIRPORT } from "../data/places";
import { VEHICLES } from "../data/vehicles";

const sel = (id: string) => {
  const pl = placeById(id);
  if (!pl) throw new Error(`missing place ${id}`);
  return selFromPlace(pl);
};
const saloon = VEHICLES[0];
const airport = selFromPlace(AIRPORT);

// No Supabase in unit tests — the km model prices every pair.
const q = (from: ReturnType<typeof sel>, to: ReturnType<typeof sel>, isReturn = false, vehicle = saloon) =>
  quote({ from, to, vehicle, isReturn, pricing: null });

describe("quote — one function, no surprises (§5)", () => {
  it("2 · cross-island costs more than a neighbourhood hop", () => {
    const cross = q(sel("palm-beach"), sel("savaneta")).totalUsd;   // +13 → −10
    const hop = q(sel("palm-beach"), sel("eagle-beach")).totalUsd;  // +13 → +8
    expect(cross).toBeGreaterThan(hop);
    // and the hop still respects the $28 floor
    expect(hop).toBeGreaterThanOrEqual(28);
  });

  it("3 · remote spots respect floor fare AND floor duration from every origin", () => {
    const origins = ["palm-beach", "oranjestad", "savaneta", "san-nicolas"].map(sel);
    for (const from of origins) {
      const arikok = q(from, sel("arikok"));
      expect(arikok.totalUsd).toBeGreaterThanOrEqual(55);
      expect(arikok.minutes).toBeGreaterThanOrEqual(30);
      const pool = q(from, sel("natural-pool"));
      expect(pool.totalUsd).toBeGreaterThanOrEqual(65);
      expect(pool.minutes).toBeGreaterThanOrEqual(40);
    }
    // Baby Beach far southeast — pricier than a Palm Beach airport-side run
    expect(q(airport, sel("baby-beach")).totalUsd).toBeGreaterThan(q(airport, sel("palm-beach")).totalUsd);
  });

  it("4 · return doubles the per-vehicle number itself", () => {
    for (const v of VEHICLES) {
      const one = quote({ from: airport, to: sel("ritz"), vehicle: v, isReturn: false, pricing: null });
      const ret = quote({ from: airport, to: sel("ritz"), vehicle: v, isReturn: true, pricing: null });
      expect(ret.totalUsd).toBe(one.totalUsd * 2);
      expect(ret.oneWayUsd).toBe(one.oneWayUsd);
    }
  });

  it("5 · a custom address prices via its area anchor", () => {
    const villa = selFromCustom("Villa Kudawecha 12", areaByName("Malmok")!, "White gate");
    const viaAnchor = q(airport, villa).totalUsd;
    const malmok = q(airport, sel("malmok-beach")).totalUsd;
    // same area anchor → same axis position → same model fare
    expect(Math.abs(viaAnchor - malmok)).toBeLessThanOrEqual(Math.round(2 * 1.4 * saloon.mult) + 1);
    expect(viaAnchor).toBeGreaterThanOrEqual(28);
  });

  it("symmetry — swapping pickup and drop-off never changes the price", () => {
    const ab = q(sel("palm-beach"), sel("san-nicolas")).totalUsd;
    const ba = q(sel("san-nicolas"), sel("palm-beach")).totalUsd;
    expect(ab).toBe(ba);
  });

  it("airport legs read the catalog drive time; floors win", () => {
    expect(legDuration(airport, sel("ritz"))).toBe(19);
    expect(legDuration(sel("baby-beach"), airport)).toBe(35);
    expect(legDuration(sel("palm-beach"), sel("eagle-beach"))).toBeGreaterThanOrEqual(10);
  });

  it("usd formats whole dollars only — no cents, no florin", () => {
    expect(usd(41.6)).toBe("$42");
    expect(usd(28)).toBe("$28");
  });
});

describe("quote — the fare does not depend on when you asked", () => {
  // A rate card with a night window and a 25% night surcharge, so the two
  // paths through legBaseUsd can actually be told apart.
  const card: Pricing = {
    zones: [], locations: [],
    routes: [{ from_name: "airport", to_name: "palm beach", price: 40, bidirectional: true }],
    addons: [{ key: "late_night", label: "Night rate", kind: "percent", amount: 25, sort: 1 }],
    config: { min_fare: 12, late_night_start: 23, late_night_end: 5 },
    loaded: true,
  };
  const palm = sel("palm-beach");
  const run = (pickupTime?: string) =>
    quote({ from: airport, to: palm, vehicle: saloon, isReturn: false, pricing: card, pickupTime });

  it("prices the same route the same on any date", () => {
    // Same journey, same hour, two different days: one number.
    // Nothing in the engine reads a calendar date, so a customer re-quoting
    // on Tuesday and on Thursday must never see two prices.
    expect(run("14:35").totalUsd).toBe(run("14:35").totalUsd);
  });

  it("charges the night rate for a night pickup, not a night visitor", () => {
    const afternoon = run("14:00");
    const smallHours = run("01:30");
    expect(afternoon.lateNight).toBe(false);
    expect(smallHours.lateNight).toBe(true);
    expect(smallHours.totalUsd).toBeGreaterThan(afternoon.totalUsd);
  });

  it("prices at the neutral hour before a pickup time is known", () => {
    // The hero card asks for no time. Whatever the browser's clock says —
    // 01:00 in Amsterdam included — the quote must match a midday one.
    expect(run().totalUsd).toBe(run("12:00").totalUsd);
    expect(run().lateNight).toBe(false);
  });

  it("reads the hour off the string, never off a Date", () => {
    // Aruba is UTC−4 all year, so "HH:MM" already IS local time. Building a
    // Date here would re-interpret it in the viewer's zone.
    expect(arubaHour("00:15")).toBe(0);
    expect(arubaHour("23:59")).toBe(23);
    expect(arubaHour("")).toBeNull();
    expect(arubaHour(undefined)).toBeNull();
  });
});

/**
 * A typed address is priced by the rate card, like everything else.
 *
 * It used to skip the card entirely and land on the km model, which quoted
 * a typed "Manchebo Beach Resort" 38% above the same hotel picked from the
 * list — same car, same road, two prices, decided by how the traveller
 * happened to enter it. The card is now asked about the address's AREA,
 * which for a geocoded address was chosen from its coordinates.
 */
describe("a typed address on the rate card", () => {
  // ƒ35 airport → Eagle Beach, the row the deployed card actually carries
  const card: Pricing = {
    // Eagle Beach and Palm Beach sit in DIFFERENT zones at different
    // prices on purpose. Same-zone fixtures hide this class of bug: a
    // wrong name match lands on the same fare and the test still passes.
    zones: [
      { zone_code: "A", island: "aruba", active: true },
      { zone_code: "B", island: "aruba", active: true },
    ],
    locations: [
      { name: "Queen Beatrix International Airport", zone_code: "AIRPORT" },
      { name: "Eagle Beach", zone_code: "A" },
      { name: "Palm Beach", zone_code: "B" },
    ],
    routes: [
      { from_name: "Airport", to_name: "Eagle Beach", price: 35, bidirectional: true },
      { from_name: "ZONE:AIRPORT", to_name: "ZONE:A", price: 35, bidirectional: true },
      { from_name: "ZONE:AIRPORT", to_name: "ZONE:B", price: 60, bidirectional: true },
    ],
    addons: [],
    config: { min_fare: 12, late_night_start: 23, late_night_end: 5 },
    loaded: true,
  };
  const priced = (to: ReturnType<typeof sel>) =>
    quote({ from: airport, to, vehicle: saloon, isReturn: false, pricing: card });

  const typedInEagleBeach = {
    id: "gp-x", name: "Sasakiweg 34", area: "Eagle Beach" as const,
    km: 8, min: 15, custom: true, lat: 12.5585, lon: -70.0565,
  };

  it("charges a typed address what the catalog place beside it costs", () => {
    expect(priced(typedInEagleBeach).totalUsd).toBe(priced(sel("eagle-beach")).totalUsd);
  });

  it("reads that price off the rate card, not the km model", () => {
    const t = priced(typedInEagleBeach);
    expect(t.source).toBe("engine");
    // the model would have said $33 for this leg; the card says ƒ35 → $21
    expect(t.totalUsd).toBe(21);
  });

  // pricing.ts pairs location names by loose substring in BOTH directions,
  // so a typed line reaching it is how a villa prices as the resort it is
  // named after. The area is asked about instead — ten strings this app
  // owns — and no character the traveller typed is ever matched.
  it("never lets the typed text reach the matcher", () => {
    const villa = {
      id: "gp-y", name: "Palm Beach Villa 3", area: "Eagle Beach" as const,
      km: 8, min: 15, custom: true, lat: 12.5585, lon: -70.0565,
    };
    // named for Palm Beach, standing in Eagle Beach: the coordinates win
    expect(priced(villa).totalUsd).toBe(priced(sel("eagle-beach")).totalUsd);
  });

  it("still falls to the km model where the card has no row for the area", () => {
    const remote = selFromCustom("Casa Bunita 7", areaByName("San Nicolas")!);
    expect(priced(remote).source).toBe("model");
  });
});
