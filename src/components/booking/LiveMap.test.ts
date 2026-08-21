import { describe, it, expect } from "vitest";
import { decodePolyline } from "./LiveMap";

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
