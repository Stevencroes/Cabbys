import { describe, it, expect } from "vitest";
import { VEHICLES, fitsParty } from "./vehicles";

describe("vehicles", () => {
  it("has the four classes", () => {
    expect(VEHICLES.map(v => v.id)).toEqual(["sedan", "premium", "suv", "van"]);
  });
  it("fitsParty validates passengers and luggage capacity", () => {
    const sedan = VEHICLES.find(v => v.id === "sedan")!;
    expect(fitsParty(sedan, 3, 2)).toBe(true);
    expect(fitsParty(sedan, 4, 2)).toBe(false);
    expect(fitsParty(sedan, 3, 3)).toBe(false); // the Saloon takes 2 bags
  });
});
