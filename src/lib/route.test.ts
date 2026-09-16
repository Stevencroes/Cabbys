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

import { AIRPORT_COORD, coordOf, drivingRoute, islandPath, pinMapUrl, project, staticMapUrl } from "./route";
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

  // What the FIRST paint shows, before anything has been resolved: two
  // hotels in one area share their area's centre. This used to be the end
  // of the story and is now only the start of it — placePins.ts moves each
  // to its own point once Google answers, which placePins.test.ts covers.
  // Nothing here resolves a pin, so this is the un-resolved state on purpose.
  it("starts two hotels in one area on one pin, before Google is asked", () => {
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

// ── the driver's pickup map ──
// Built here rather than asserted through the ride screen, because that
// component only asks for an image once it has MEASURED itself and jsdom
// measures everything as zero — a test driving it through the DOM would
// prove the fallback and nothing else.
describe("pinMapUrl", () => {
  const at = { lat: 12.5014, lon: -70.0152 };

  it("centres on the point and says how close to look", () => {
    const url = pinMapUrl(at, { width: 416, height: 170, retina: true, zoom: 15 }) ?? "";
    const q = new URLSearchParams(url.split("?")[1] ?? "");
    expect(url.startsWith("https://maps.googleapis.com/maps/api/staticmap?")).toBe(true);
    expect(q.get("center")).toBe("12.5014,-70.0152");
    expect(q.get("zoom")).toBe("15");
    expect(q.get("size")).toBe("416x170");
    expect(q.get("scale")).toBe("2");
    expect(q.getAll("markers")).toEqual(["size:mid|color:0xf2f5f8|12.5014,-70.0152"]);
    // the dark style the rest of the site's maps wear, not a default map
    expect(q.getAll("style").length).toBeGreaterThan(1);
  });

  // Door level for a point somebody stood on; wider for one derived from a
  // place name, because pretending to that accuracy is the lie this file
  // exists to avoid.
  it("defaults to door level, and takes a wider frame when asked", () => {
    const near = new URLSearchParams((pinMapUrl(at, { width: 400, height: 170 }) ?? "").split("?")[1]);
    expect(near.get("zoom")).toBe("17");
    expect(near.get("scale")).toBeNull();
  });

  it("asks for nothing at all without a key, so the sketch stands", () => {
    google.googleMapsEnabled = false;
    expect(pinMapUrl(at, { width: 400, height: 170 })).toBeNull();
    google.googleMapsEnabled = true;
  });

  // A frame wider than Google will serve used to be sent as-is. The reply
  // is an error image, and the map component draws whatever arrives — so
  // the driver got that error magnified to fill the frame, which looked
  // like a broken map rather than a refused request.
  it("never asks for a size the static endpoint refuses", () => {
    const q = new URLSearchParams((pinMapUrl(at, { width: 2016, height: 170 }) ?? "").split("?")[1]);
    expect(q.get("size")).toBe("640x170");
  });

  it("clamps the route map the same way, from the same place", () => {
    const q = new URLSearchParams(
      (staticMapUrl(at, { lat: 12.57, lon: -70.05 }, null, { width: 1600, height: 900 }) ?? "").split("?")[1],
    );
    expect(q.get("size")).toBe("640x640");
  });
});
