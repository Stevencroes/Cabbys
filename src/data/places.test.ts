import { describe, it, expect } from "vitest";
import {
  GROUPS, AREAS, AIRPORT, placesByGroup, findPlaceByName,
  searchPlaces, selFromCustom, selFromGeo, areaByName, nearestArea, axisAt,
} from "./places";

describe("places catalog (§3.1)", () => {
  it("km is SIGNED — northwest positive, southeast negative", () => {
    expect(findPlaceByName("Palm Beach")!.km).toBeGreaterThan(0);
    expect(findPlaceByName("Savaneta")!.km).toBeLessThan(0);
    expect(AIRPORT.km).toBe(0);
    // the money-losing bug: these two must NOT look one km apart
    const gap = Math.abs(findPlaceByName("Palm Beach")!.km - findPlaceByName("Savaneta")!.km);
    expect(gap).toBeGreaterThan(20);
  });

  it("covers more than resorts", () => {
    for (const g of GROUPS) {
      expect(placesByGroup(g).length, `group ${g}`).toBeGreaterThan(0);
    }
  });

  it("keeps names matching the pricing rows (exact strings)", () => {
    expect(findPlaceByName("The Ritz-Carlton Aruba")).toBeTruthy();
    expect(findPlaceByName("Aruba Marriott Resort")).toBeTruthy();
    expect(findPlaceByName("Queen Beatrix International Airport")!.id).toBe("airport");
  });

  it("remote detour spots carry floor duration", () => {
    expect(findPlaceByName("Arikok National Park")!.md).toBeGreaterThanOrEqual(30);
    expect(findPlaceByName("Natural Pool (Conchi)")!.md).toBeGreaterThanOrEqual(40);
  });

  it("search filters across name and area", () => {
    expect(searchPlaces("palm").some((p) => p.id === "palm-beach")).toBe(true);
    expect(searchPlaces("savaneta").some((p) => p.id === "flying-fishbone")).toBe(true);
    expect(searchPlaces("").length).toBe(0);
  });

  it("custom addresses anchor to one of the ten areas", () => {
    expect(AREAS).toHaveLength(10);
    const s = selFromCustom("Casa Bunita 7", areaByName("Noord")!, "Blue door");
    expect(s.custom).toBe(true);
    expect(s.km).toBe(areaByName("Noord")!.km);
  });

  // The whole point of the geocoder returning coordinates. A fixed-fare
  // transfer prices by area, and until this existed a typed address got its
  // area from a dropdown — which asks someone who has never been to Aruba
  // whether their villa is in Noord or Paradera, and then charges them for
  // the answer. The coordinates already know.
  it("prices a geocoded address from where it actually is", () => {
    const villa = selFromGeo({
      id: "mb-poi.1", name: "Boca Catalina Villa",
      address: "Malmokweg 9, Noord", lat: 12.594, lon: -70.051,
    });
    // Malmok is the nearest of the ten to those coordinates
    expect(villa.area).toBe("Malmok");
    expect(villa.km).toBe(areaByName("Malmok")!.km);
    expect(villa.min).toBe(areaByName("Malmok")!.min);
    // still custom: quote.ts routes custom selections to the km model, and a
    // geocoder's spelling of a hotel must never start matching the rate card
    expect(villa.custom).toBe(true);
    expect(villa.lat).toBe(12.594);

    // the other end of the island resolves to the other end of the ladder
    const south = selFromGeo({
      id: "mb-address.2", name: "Seroe Colorado 3",
      address: "San Nicolas", lat: 12.433, lon: -69.905,
    });
    expect(south.area).toBe("San Nicolas");
    expect(south.km).toBeLessThan(0);
  });

  it("snaps a coordinate to exactly one area, wherever it is", () => {
    // every area centre must resolve to itself, or the snap is lying
    for (const a of AREAS) expect(nearestArea(a.lat, a.lon).name).toBe(a.name);
  });

  // `km` is a hand-set fare axis, not a distance — Santa Cruz is 5.9 km from
  // the airport and sits at −2, Palm Beach is 9.0 km away and sits at +13.
  // So a typed address is placed relative to the points that DEFINE the
  // scale, never computed from geometry.
  describe("axisAt — placing an address on the fare scale", () => {
    it("gives an area centre exactly the numbers it already had", () => {
      for (const a of AREAS) {
        expect(axisAt(a.lat, a.lon)).toEqual({ km: a.km, min: Math.max(5, a.min) });
      }
      // and the origin of the scale is still zero
      expect(axisAt(12.5014, -70.0152).km).toBe(0);
    });

    it("slides between neighbours instead of snapping to one", () => {
      // north of the Palm Beach centre, on the way to Malmok
      const north = axisAt(12.5905, -70.0455);
      expect(north.km).toBeGreaterThan(13);
      expect(north.km).toBeLessThan(17);
    });

    it("never quotes a drive shorter than anyone could actually make", () => {
      // 600 m from the terminal. The airport anchor's min is 0 because it is
      // the origin, and interpolation would otherwise offer a one-minute ride.
      expect(axisAt(12.5060, -70.0180).min).toBeGreaterThanOrEqual(5);
    });

    it("prices a typed address from where it is, not from its area centre", () => {
      const villa = selFromGeo({
        id: "mb-poi.1", name: "Villa", address: "", lat: 12.5905, lon: -70.0455,
      });
      const area = areaByName(villa.area as "Malmok")!;
      // the area is still what the driver is told
      expect(villa.area).toBe("Malmok");
      // the fare is not the area's
      expect(villa.km).not.toBe(area.km);
      expect(villa.km).toBeCloseTo(15.8, 1);
    });
  });
});
