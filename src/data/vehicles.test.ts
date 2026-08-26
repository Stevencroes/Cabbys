import { describe, it, expect } from "vitest";
import { MAX_PAX, VEHICLES, fitsParty } from "./vehicles";

describe("vehicles", () => {
  it("has the four classes", () => {
    expect(VEHICLES.map(v => v.id)).toEqual(["suv", "vclass", "transit", "sprinter"]);
  });
  // The seat counts are claims about real cars, and the fleet has been wrong
  // about them before — the Scout advertised six while its car seats five.
  // Pinned here so a capacity can only change on purpose.
  it("seats what the cars actually seat", () => {
    expect(VEHICLES.map(v => [v.id, v.pax])).toEqual([
      ["suv", 4],       // Lincoln Nautilus — five seats, one is the driver's
      ["vclass", 6],    // Mercedes V-Class
      ["transit", 7],   // Ford Transit
      ["sprinter", 12], // Mercedes Sprinter
    ]);
  });
  it("climbs the fleet as the party grows, and can seat twelve", () => {
    const fitFor = (n: number) => VEHICLES.find(v => fitsParty(v, n, 0))?.id;
    expect(fitFor(4)).toBe("suv");
    expect(fitFor(5)).toBe("vclass");
    expect(fitFor(7)).toBe("transit");
    expect(fitFor(8)).toBe("sprinter");
    // the ceiling the steppers expose has to be a party the fleet can carry
    expect(fitFor(MAX_PAX)).toBe("sprinter");
    expect(VEHICLES.find(v => fitsParty(v, MAX_PAX + 1, 0))).toBeUndefined();
  });

  it("keeps the fare ladder it had before the fleet changed", () => {
    expect(VEHICLES.map(v => v.mult)).toEqual([1.0, 1.38, 1.6, 2.05]);
  });
  it("fitsParty validates passengers and luggage capacity", () => {
    const suv = VEHICLES.find(v => v.id === "suv")!;
    expect(fitsParty(suv, 4, 5)).toBe(true);
    expect(fitsParty(suv, 5, 0)).toBe(false); // a Nautilus cannot take five guests
    expect(fitsParty(suv, 4, 6)).toBe(false); // nor six bags
    const sprinter = VEHICLES.find(v => v.id === "sprinter")!;
    expect(fitsParty(sprinter, 12, 12)).toBe(true);
  });
});
