import { describe, it, expect } from "vitest";
import { decodePolyline, isFatal } from "./LiveMap";

/**
 * The only pure part of LiveMap, and the load-bearing one: get this wrong
 * and the route is drawn somewhere that is not Aruba.
 */
describe("decodePolyline", () => {
  it("decodes the example from the Google/Mapbox spec", () => {
    // "_p~iF~ps|U_ulLnnqC_mqNvxq`@" is the documented sample, and it decodes
    // to three points in California — lon first, matching GeoJSON order
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toHaveLength(3);
    expect(pts[0][1]).toBeCloseTo(38.5, 5);
    expect(pts[0][0]).toBeCloseTo(-120.2, 5);
    expect(pts[2][1]).toBeCloseTo(43.252, 5);
    expect(pts[2][0]).toBeCloseTo(-126.453, 5);
  });

  it("returns nothing for an empty string rather than throwing", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

/**
 * The bug this guards: a map that had drawn correctly vanished a second or
 * two later. Mapbox reports everything through one `error` event, and every
 * one of them was being treated as fatal — so a tile that 404d, or a
 * telemetry beacon an ad blocker refused, tore down a working map.
 */
describe("isFatal", () => {
  it("is true for a refused token", () => {
    expect(isFatal({ status: 401 })).toBe(true);
    expect(isFatal({ status: 403 })).toBe(true);
    expect(isFatal({ message: "Unauthorized: you may have provided an invalid Mapbox access token" })).toBe(true);
    expect(isFatal({ message: "Failed to load style" })).toBe(true);
  });

  it("is false for the things that are not the whole map", () => {
    expect(isFatal({ status: 404, message: "Tile load failed" })).toBe(false);
    expect(isFatal({ message: "Failed to fetch glyph range 0-255" })).toBe(false);
    expect(isFatal({ message: "net::ERR_BLOCKED_BY_CLIENT" })).toBe(false);
    expect(isFatal(undefined)).toBe(false);
    expect(isFatal({})).toBe(false);
  });
});
