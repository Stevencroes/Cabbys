import { describe, it, expect } from "vitest";
import { VEHICLES, fitsParty } from "./vehicles";

describe("vehicles", () => {
  it("has the four classes", () => {
    expect(VEHICLES.map(v => v.id)).toEqual(["sedan", "premium", "suv", "van"]);
  });
  // The seat counts are claims about real cars, and the fleet has been wrong
  // about them before — the Scout advertised six while its car seats five.
  // Pinned here so a capacity can only change on purpose.
  it("seats what the cars actually seat", () => {
    expect(VEHICLES.map(v => [v.id, v.pax])).toEqual([
      ["sedan", 3],    // Ford Fusion
      ["premium", 3],  // Mercedes S-Class
      ["suv", 4],      // Lincoln Nautilus — five seats, one is the driver's
      ["van", 7],      // Ford Transit
    ]);
  });
  it("sends parties of five and six to the Voyager, the only car that holds them", () => {
    for (const party of [5, 6, 7]) {
      const fit = VEHICLES.find(v => fitsParty(v, party, 0));
      expect(fit?.id).toBe("van");
    }
  });
  it("fitsParty validates passengers and luggage capacity", () => {
    const sedan = VEHICLES.find(v => v.id === "sedan")!;
    expect(fitsParty(sedan, 3, 2)).toBe(true);
    expect(fitsParty(sedan, 4, 2)).toBe(false);
    expect(fitsParty(sedan, 3, 3)).toBe(false); // the Saloon takes 2 bags
    const suv = VEHICLES.find(v => v.id === "suv")!;
    expect(fitsParty(suv, 4, 5)).toBe(true);
    expect(fitsParty(suv, 5, 0)).toBe(false); // a Nautilus cannot take five guests
  });
});
