import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => {
  const data = {
    pricing_zones: [{ zone_code: "A", island: "aruba", active: true }],
    pricing_locations: [
      { name: "Queen Beatrix International Airport", zone_code: "AIRPORT" },
      { name: "Palm Beach", zone_code: "A" },
      { name: "Eagle Beach", zone_code: "A" },
    ],
    pricing_routes: [
      { from_name: "Airport", to_name: "Palm Beach", price: 40, bidirectional: true },
      { from_name: "Palm Beach", to_name: "Eagle Beach", price: 12, bidirectional: true },
    ],
    pricing_addons: [
      { key: "late_night", label: "Late-night", kind: "percent", amount: 15, sort: 1 },
      { key: "luxury", label: "Luxury", kind: "percent", amount: 40, sort: 2 },
      { key: "child_seat", label: "Child seat", kind: "flat", amount: 5, sort: 3 },
    ],
    pricing_config: [
      { key: "min_fare", value: 12 }, { key: "late_night_start", value: 23 }, { key: "late_night_end", value: 5 },
    ],
  };
  const builder = (table: string) => {
    const rows = (data as any)[table] || [];
    const b: any = {
      _rows: rows,
      select() { return b; }, eq() { return b; }, order() { return b; },
      then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); },
    };
    return b;
  };
  return { supabase: { from: builder } };
});

import { loadPricing, computeFare, addTax, zoneForLocation } from "./pricing";

describe("pricing engine", () => {
  let p: Awaited<ReturnType<typeof loadPricing>>;
  beforeEach(async () => { p = await loadPricing("aruba", true); });

  it("loads config as numbers", () => {
    expect(p.config.min_fare).toBe(12);
    expect(p.loaded).toBe(true);
  });
  it("resolves airport by name to AIRPORT zone", () => {
    expect(zoneForLocation(p, "Queen Beatrix International Airport")).toBe("AIRPORT");
  });
  it("prices a named route (airport collapses)", () => {
    const f = computeFare(p, { pickup: "Queen Beatrix International Airport", dropoff: "Palm Beach", when: new Date("2026-06-26T14:00:00") });
    expect(f.source).toBe("route");
    expect(f.total).toBe(40);
  });
  it("applies a daytime fare with no late-night surcharge", () => {
    const f = computeFare(p, { pickup: "Palm Beach", dropoff: "Eagle Beach", when: new Date("2026-06-26T14:00:00") });
    expect(f.total).toBe(12);
  });
  it("adds late-night 15% after 23:00", () => {
    const f = computeFare(p, { pickup: "Airport", dropoff: "Palm Beach", when: new Date("2026-06-26T23:30:00") });
    expect(f.total).toBeCloseTo(46, 2);
  });
  it("adds 6% tax", () => {
    expect(addTax(100).tax).toBeCloseTo(6, 2);
    expect(addTax(100).total).toBeCloseTo(106, 2);
  });
});
