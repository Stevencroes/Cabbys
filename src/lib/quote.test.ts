import { describe, it, expect } from "vitest";
import { quote, legDuration, usd } from "./quote";
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
