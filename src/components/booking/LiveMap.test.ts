import { describe, it, expect } from "vitest";
import { decodePolyline } from "./LiveMap";

/**
 * The only pure part of LiveMap, and the load-bearing one: get this wrong
 * and the route is drawn somewhere that is not Aruba. Google's Routes API
 * and the Mapbox Directions API this replaced both speak the same
 * "Encoded Polyline Algorithm Format", so this decoder needed no changes
 * when the provider did.
 */
describe("decodePolyline", () => {
  it("decodes the example from the format's own spec", () => {
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

// isFatal (the Mapbox GL error-event triage this file used to need) is
// gone with Mapbox: Google's failure model has no single catch-all `error`
// event mixing tile 404s in with a refused key, so there is no tile-vs-
// fatal distinction left to make. See lib/googleMaps.ts's gm_authFailure
// wiring for how a refused key is detected instead.
