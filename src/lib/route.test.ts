import { describe, it, expect } from "vitest";
import { AIRPORT_COORD, coordOf, islandPath, project, staticMapUrl } from "./route";
import { AIRPORT, placeById, selFromPlace } from "../data/places";

const sel = (id: string) => selFromPlace(placeById(id)!);

describe("route", () => {
  it("gives the airport its own point, not an area centre", () => {
    expect(coordOf(selFromPlace(AIRPORT))).toEqual(AIRPORT_COORD);
  });

  it("reads a place's coordinates off the area it sits in", () => {
    const ritz = coordOf(sel("ritz"));
    expect(ritz).toEqual({ lat: 12.578, lon: -70.043 });
  });

  it("puts two hotels in one area on one pin — the known limit", () => {
    expect(coordOf(sel("ritz"))).toEqual(coordOf(sel("hyatt")));
  });

  it("has no coordinates to give for nothing", () => {
    expect(coordOf(null)).toBeNull();
  });

  it("draws no map without a token", () => {
    // VITE_MAPBOX_TOKEN is unset under test, which is the shipping state
    expect(staticMapUrl(AIRPORT_COORD, { lat: 12.578, lon: -70.043 }, null, { width: 400, height: 200 })).toBeNull();
  });

  it("projects the island inside its own viewBox", () => {
    for (const c of [AIRPORT_COORD, { lat: 12.615, lon: -70.058 }, { lat: 12.412, lon: -69.869 }]) {
      const p = project(c, 320, 200);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(320);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
    }
  });

  it("puts north above south and west left of east", () => {
    const nw = project({ lat: 12.615, lon: -70.058 }, 320, 200);
    const se = project({ lat: 12.412, lon: -69.869 }, 320, 200);
    expect(nw.y).toBeLessThan(se.y);   // SVG counts downward
    expect(nw.x).toBeLessThan(se.x);
  });

  it("closes the coastline into a shape", () => {
    const d = islandPath(320, 200);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});
