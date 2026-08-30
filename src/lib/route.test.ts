import { describe, it, expect, vi } from "vitest";

// The URL builder must not depend on whether a developer happens to have
// VITE_MAPBOX_TOKEN in .env.local — both branches get tested on purpose.
const mapbox = vi.hoisted(() => ({ MAPBOX_TOKEN: "pk.test", mapboxEnabled: true }));
vi.mock("./mapbox", () => mapbox);

import { AIRPORT_COORD, coordOf, islandPath, project, staticMapUrl } from "./route";
import { AIRPORT, areaByName, placeById, selFromCustom, selFromGeo, selFromPlace } from "../data/places";

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

  // The catalog has no coordinates of its own, so a hotel gets its area's.
  // A geocoded address DOES, and drawing it at the middle of Oranjestad
  // instead of where it is puts the map at odds with the address written
  // above it — which is the one thing that has to be true before anyone
  // believes the price underneath.
  it("draws a geocoded address where it actually is", () => {
    const typed = selFromGeo({
      id: "mb-address.1", name: "Sasakiweg 34", address: "Oranjestad",
      lat: 12.513, lon: -70.026,
    });
    expect(coordOf(typed)).toEqual({ lat: 12.513, lon: -70.026 });
    // not the area centre it is priced from
    expect(coordOf(typed)).not.toEqual(coordOf(sel("oranjestad")));
  });

  // An address typed into the manual fallback has no coordinates at all, and
  // the area centre remains the only honest answer for it.
  it("still falls back to the area for an address nobody could place", () => {
    const guessed = selFromCustom("Casa Bunita 7", areaByName("Noord")!);
    expect(coordOf(guessed)).toEqual({ lat: 12.578, lon: -70.027 });
  });

  it("has no coordinates to give for nothing", () => {
    expect(coordOf(null)).toBeNull();
  });

  const PALM = { lat: 12.578, lon: -70.043 };

  it("draws no map without a token, so the sketch takes over", () => {
    mapbox.mapboxEnabled = false;
    expect(staticMapUrl(AIRPORT_COORD, PALM, null, { width: 400, height: 200 })).toBeNull();
    mapbox.mapboxEnabled = true;
  });

  it("asks for a dark map with both ends pinned", () => {
    const url = staticMapUrl(AIRPORT_COORD, PALM, null, { width: 400, height: 200, retina: true })!;
    expect(url).toContain("/styles/v1/mapbox/dark-v11/static/");
    expect(url).toContain(`pin-s+f2f5f8(${AIRPORT_COORD.lon},${AIRPORT_COORD.lat})`);
    expect(url).toContain(`pin-s+b9c6d4(${PALM.lon},${PALM.lat})`);
    expect(url).toContain("400x200@2x");
  });

  it("draws the driving line when it has one", () => {
    const line = { polyline: "a~b_cD|e~f", km: 12.3, minutes: 19 };
    const url = staticMapUrl(AIRPORT_COORD, PALM, line, { width: 400, height: 200 })!;
    expect(url).toContain(`path-4+b9c6d4-0.95(${encodeURIComponent(line.polyline)})`);
  });

  it("suppresses Mapbox's own attribution only because the component renders it", () => {
    // If this ever stops being true, RouteMap's caption must come back too —
    // the attribution is a term of the licence.
    const url = staticMapUrl(AIRPORT_COORD, PALM, null, { width: 400, height: 200 })!;
    expect(url).toContain("attribution=false");
    expect(url).toContain("logo=false");
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
