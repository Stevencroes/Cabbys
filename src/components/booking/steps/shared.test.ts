import { describe, it, expect } from "vitest";
import { effectivePickupDate, effectivePickupTime, driveToAirport } from "./shared";
import { AIRPORT, placeById, selFromPlace } from "../../../data/places";
import { legDuration } from "../../../lib/quote";
import type { BookingState } from "../../../booking/BookingContext";

const hotel = selFromPlace(placeById("ritz")!);
const airport = selFromPlace(AIRPORT);
const base = { date: "2026-11-03", pickupTime: "09:00", destUS: true, flightLanding: "", depTime: "" };
const s = (over: Partial<BookingState>) => ({ ...base, ...over }) as unknown as BookingState;

describe("the pickup a flight home works back to", () => {
  it("takes the real drive off as well as the airport lead", () => {
    const drive = legDuration(hotel, airport);
    expect(drive).toBeGreaterThan(0);
    const st = s({ from: hotel, to: airport, depTime: "14:00" });
    expect(driveToAirport(st)).toBe(drive);
    const mins = 14 * 60 - 180 - drive;
    expect(effectivePickupTime(st)).toBe(`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
    expect(effectivePickupDate(st)).toBe("2026-11-03");
  });

  it("stores an early take-off on the evening before", () => {
    const st = s({ from: hotel, to: airport, depTime: "01:30" });
    expect(effectivePickupDate(st)).toBe("2026-11-02");
    expect(effectivePickupTime(st) > "20:00").toBe(true);
  });

  it("leaves an arrival and an ordinary ride on the day asked", () => {
    expect(effectivePickupDate(s({ from: airport, to: hotel, flightLanding: "00:10" }))).toBe("2026-11-03");
    expect(effectivePickupDate(s({ from: hotel, to: selFromPlace(placeById("ritz")!) }))).toBe("2026-11-03");
    expect(effectivePickupTime(s({ from: hotel, to: hotel }))).toBe("09:00");
  });
});
