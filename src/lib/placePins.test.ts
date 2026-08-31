import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GeoAnswer } from "./places";

// Only geocode is stubbed. Replacing the whole module would take
// GOOGLE_PLACES_KEY with it, which googleMaps.ts re-exports and route.ts
// then imports — the failure surfaces three files away from the mock.
const places = vi.hoisted(() => ({ geocode: vi.fn() }));
vi.mock("./places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./places")>()),
  geocode: places.geocode,
}));

import { pinFor, resolvePin, resetPins, onPinsChanged } from "./placePins";
import { coordOf } from "./route";
import { AIRPORT, areaByName, placeById, selFromCustom, selFromGeo, selFromPlace } from "../data/places";

const sel = (id: string) => selFromPlace(placeById(id)!);
const found = (name: string, lat: number, lon: number): GeoAnswer => ({
  status: "ok",
  results: [{ id: `gp-${name}`, name, address: "Aruba", kind: "poi", lat, lon }],
});
const nothing: GeoAnswer = { results: [], status: "empty" };

beforeEach(() => {
  resetPins();
  places.geocode.mockReset();
});

/**
 * The bug this file exists for, in the words it was reported in: picking
 * "Eagle Beach" put the pin near Bubali — inland, four or five minutes
 * from the beach it names. It was the AREA's centre, which is what every
 * catalog place got, because the catalog carries no coordinates.
 */
describe("the Eagle Beach case", () => {
  const INLAND = { lat: 12.552, lon: -70.049 };   // the area centre, ~1 km inland
  const BEACH = { lat: 12.5585, lon: -70.0565 };  // where Google puts the label

  it("starts at the area centre, because that is all the catalog knows", () => {
    expect(coordOf(sel("eagle-beach"))).toEqual(INLAND);
  });

  it("moves to the real point once Google has been asked", async () => {
    places.geocode.mockResolvedValue(found("Eagle Beach", BEACH.lat, BEACH.lon));
    await resolvePin(sel("eagle-beach"));
    expect(coordOf(sel("eagle-beach"))).toEqual(BEACH);
  });

  it("stops two hotels in one area sharing a pin", async () => {
    places.geocode
      .mockResolvedValueOnce(found("Manchebo Beach Resort", 12.5555, -70.0545))
      .mockResolvedValueOnce(found("La Cabana Beach Resort", 12.5625, -70.0592));
    await resolvePin(sel("manchebo"));
    await resolvePin(sel("la-cabana"));
    expect(coordOf(sel("manchebo"))).not.toEqual(coordOf(sel("la-cabana")));
  });
});

/**
 * The guard is the whole reason this can be trusted. A text search for a
 * restaurant name will happily match a same-named place on another
 * continent, and a pin in Portugal is a far worse answer than a coarse
 * one a kilometre inland. The area centre is imprecise but never absurd,
 * which makes it the right thing to fall back to.
 */
describe("a match in the wrong place", () => {
  it("refuses a result too far from the area it belongs to", async () => {
    // ~40 km east: off the island entirely
    places.geocode.mockResolvedValue(found("The Old Man & The Sea", 12.45, -69.55));
    await resolvePin(sel("old-man-sea"));
    expect(pinFor("old-man-sea")).toBeNull();
    const savaneta = areaByName("Savaneta")!;
    expect(coordOf(sel("old-man-sea"))).toEqual({ lat: savaneta.lat, lon: savaneta.lon });
  });

  it("accepts a correction that is merely imprecise, not absurd", async () => {
    // 1.2 km from the centre — exactly the kind of fix this is for
    places.geocode.mockResolvedValue(found("Eagle Beach", 12.5585, -70.0565));
    await resolvePin(sel("eagle-beach"));
    expect(pinFor("eagle-beach")).not.toBeNull();
  });

  it("keeps the area centre when Google knows nothing", async () => {
    places.geocode.mockResolvedValue(nothing);
    await resolvePin(sel("gasparito"));
    expect(pinFor("gasparito")).toBeNull();
  });
});

describe("what it declines to ask about", () => {
  it("leaves a geocoded address alone — it already arrived with its point", async () => {
    const typed = selFromGeo({
      id: "gp-1", name: "Sasakiweg 34", address: "Oranjestad", lat: 12.513, lon: -70.026,
    });
    await resolvePin(typed);
    expect(places.geocode).not.toHaveBeenCalled();
  });

  it("leaves the airport alone — its point is exact and hand-set", async () => {
    await resolvePin(selFromPlace(AIRPORT));
    expect(places.geocode).not.toHaveBeenCalled();
  });

  // Searching the text somebody typed is how "Villa Bucuti" ends up pinned
  // to the Bucuti resort. They told us the area; that is the answer.
  it("leaves a typed custom address alone", async () => {
    await resolvePin(selFromCustom("Casa Bunita 7", areaByName("Noord")!));
    expect(places.geocode).not.toHaveBeenCalled();
  });

  it("asks once, however many times the map redraws", async () => {
    places.geocode.mockResolvedValue(nothing);
    await resolvePin(sel("papiamento"));
    await resolvePin(sel("papiamento"));
    await resolvePin(sel("papiamento"));
    expect(places.geocode).toHaveBeenCalledTimes(1);
  });
});

describe("the map hearing about it", () => {
  it("tells a map already on screen that a pin landed", async () => {
    places.geocode.mockResolvedValue(found("Eagle Beach", 12.5585, -70.0565));
    let heard = 0;
    const off = onPinsChanged(() => { heard++; });
    await resolvePin(sel("eagle-beach"));
    expect(heard).toBe(1);
    off();
  });

  it("does not announce a refusal — nothing on the map changed", async () => {
    places.geocode.mockResolvedValue(found("elsewhere", 12.45, -69.55));
    let heard = 0;
    const off = onPinsChanged(() => { heard++; });
    await resolvePin(sel("old-man-sea"));
    expect(heard).toBe(0);
    off();
  });
});

// These places do not move. Paying Google again on every page load for an
// answer that cannot have changed is a cost with nothing to show for it.
describe("the cache", () => {
  it("writes a resolved pin where the next page load will find it", async () => {
    places.geocode.mockResolvedValue(found("Eagle Beach", 12.5585, -70.0565));
    await resolvePin(sel("eagle-beach"));
    const saved = JSON.parse(localStorage.getItem("cabbys.pins.v1") ?? "{}");
    expect(saved["eagle-beach"]).toEqual({ lat: 12.5585, lon: -70.0565 });
  });
});

describe("coordOf's order of preference", () => {
  it("prefers the selection's own coordinates over any pin", async () => {
    places.geocode.mockResolvedValue(found("Eagle Beach", 12.5585, -70.0565));
    await resolvePin(sel("eagle-beach"));
    // a geocoded address carrying its own point wins outright
    const typed = { ...sel("eagle-beach"), lat: 12.5, lon: -70.0 };
    expect(coordOf(typed)).toEqual({ lat: 12.5, lon: -70.0 });
  });

  it("prefers the airport's exact point over anything resolved", async () => {
    await resolvePin(selFromPlace(AIRPORT));
    expect(coordOf(selFromPlace(AIRPORT))).toEqual({ lat: 12.5014, lon: -70.0152 });
  });
});
