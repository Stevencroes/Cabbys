import { describe, it, expect, vi, afterEach } from "vitest";

// The URL builder must not depend on whether a developer happens to have
// VITE_GOOGLE_PLACES_KEY in .env.local — both branches get tested on purpose.
const google = vi.hoisted(() => ({
  GOOGLE_MAPS_KEY: "test-key", googleMapsEnabled: true,
  reportGoogleMapsFailure: () => {},
  DARK_MAP_STYLE: [
    { elementType: "geometry", stylers: [{ color: "#0d1c29" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
  ],
}));
vi.mock("./googleMaps", () => google);

import { AIRPORT_COORD, coordOf, drivingRoute, islandPath, project, staticMapUrl } from "./route";
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

  it("draws no map without a key, so the sketch takes over", () => {
    google.googleMapsEnabled = false;
    expect(staticMapUrl(AIRPORT_COORD, PALM, null, { width: 400, height: 200 })).toBeNull();
    google.googleMapsEnabled = true;
  });

  it("asks for a dark map with both ends pinned", () => {
    const url = staticMapUrl(AIRPORT_COORD, PALM, null, { width: 400, height: 200, retina: true })!;
    const p = new URL(url).searchParams;
    expect(p.get("maptype")).toBe("roadmap");
    expect(p.getAll("markers")).toEqual([
      `size:small|color:0xf2f5f8|${AIRPORT_COORD.lat},${AIRPORT_COORD.lon}`,
      `size:small|color:0xb9c6d4|${PALM.lat},${PALM.lon}`,
    ]);
    expect(p.get("size")).toBe("400x200");
    expect(p.get("scale")).toBe("2");
    // driven by the SAME style rules the interactive map uses, not a copy
    expect(p.getAll("style")).toContain("feature:all|element:geometry|color:0x0d1c29");
    expect(p.getAll("style")).toContain("feature:poi|element:all|visibility:off");
  });

  it("draws the driving line when it has one", () => {
    const line = { polyline: "a~b_cD|e~f", km: 12.3, minutes: 19 };
    const url = staticMapUrl(AIRPORT_COORD, PALM, line, { width: 400, height: 200 })!;
    expect(new URL(url).searchParams.get("path")).toBe(`color:0xb9c6d4f2|weight:4|enc:${line.polyline}`);
  });

  it("carries the key Places search already uses — one Google project, three APIs enabled on it", () => {
    const url = staticMapUrl(AIRPORT_COORD, PALM, null, { width: 400, height: 200 })!;
    expect(new URL(url).searchParams.get("key")).toBe("test-key");
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

/**
 * Routes API (New) is the client-callable replacement for the legacy
 * Directions API — this app already learned that lesson once, the hard
 * way, with Places (the legacy Geocoding API's browser CORS problem was
 * why address search moved providers alongside the map). These lock the
 * request shape and the response parsing, because both are new here.
 */
describe("drivingRoute", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("asks Routes API with a field mask, and reads its polyline back", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        routes: [{ polyline: { encodedPolyline: "a~b_cD|e~f" }, distanceMeters: 12345, duration: "812s" }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const line = await drivingRoute(AIRPORT_COORD, { lat: 12.578, lon: -70.043 });
    expect(line).toEqual({ polyline: "a~b_cD|e~f", km: 12.3, minutes: 14 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(init.headers).toMatchObject({ "X-Goog-Api-Key": "test-key" });
    expect(init.headers).toMatchObject({
      "X-Goog-FieldMask": expect.stringContaining("routes.polyline.encodedPolyline"),
    });
    const body = JSON.parse(init.body as string);
    expect(body.origin.location.latLng).toEqual({ latitude: AIRPORT_COORD.lat, longitude: AIRPORT_COORD.lon });
    expect(body.travelMode).toBe("DRIVE");
  });

  it("gives up cleanly when the route has no polyline to draw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ routes: [{}] }) })));
    expect(await drivingRoute(AIRPORT_COORD, { lat: 12.578, lon: -70.043 })).toBeNull();
  });

  it("draws nothing without a key, before ever asking", async () => {
    google.googleMapsEnabled = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await drivingRoute(AIRPORT_COORD, { lat: 12.578, lon: -70.043 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    google.googleMapsEnabled = true;
  });
});
