import { describe, it, expect } from "vitest";
import { CATEGORIES, placesByCategory, findPlaceByName, searchPlaces } from "./places";

describe("places catalog", () => {
  it("exposes the five categories in order", () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual(["airport", "hotels", "beaches", "dining", "sights"]);
  });
  it("keeps hotel names matching the pricing data (exact strings)", () => {
    const hotels = placesByCategory("hotels").map((p) => p.name);
    expect(hotels).toContain("The Ritz-Carlton Aruba");
    expect(hotels).toContain("Aruba Marriott Resort");
    expect(hotels).toContain("Renaissance Aruba");
  });
  it("groups places by category", () => {
    expect(placesByCategory("airport").map((p) => p.name)).toEqual(["Queen Beatrix International Airport"]);
    expect(placesByCategory("beaches").length).toBeGreaterThanOrEqual(3);
  });
  it("finds a place by exact (case-insensitive) name", () => {
    expect(findPlaceByName("eagle beach")?.id).toBe("eagle-beach");
    expect(findPlaceByName("nowhere")).toBeUndefined();
  });
  it("search matches name and meta, empty query returns nothing", () => {
    expect(searchPlaces("").length).toBe(0);
    expect(searchPlaces("palm").map((p) => p.id)).toContain("palm-beach");
  });
});
