import { describe, it, expect } from "vitest";
import {
  PLACES, GROUPS, AREAS, AIRPORT, placesByGroup, findPlaceByName,
  searchPlaces, selFromCustom, areaByName,
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
});
