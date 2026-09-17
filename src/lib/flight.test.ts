import { describe, it, expect } from "vitest";
import { isAirportTransfer, isValidFlightNumber, formatFlightNumber } from "./flight";

describe("flight helpers", () => {
  it("detects airport transfers on either end", () => {
    expect(isAirportTransfer("Queen Beatrix International Airport", "Palm Beach")).toBe(true);
    expect(isAirportTransfer("Eagle Beach", "Queen Beatrix International Airport")).toBe(true);
    expect(isAirportTransfer("Eagle Beach", "Palm Beach")).toBe(false);
  });

  it("accepts IATA-shaped flight numbers", () => {
    expect(isValidFlightNumber("AA1234")).toBe(true);
    expect(isValidFlightNumber("ua 152")).toBe(true);
    expect(isValidFlightNumber("KL765a")).toBe(true);
    expect(isValidFlightNumber("12345678")).toBe(false);
    expect(isValidFlightNumber("")).toBe(false);
  });

  it("canonicalizes for storage", () => {
    expect(formatFlightNumber("ua 1523")).toBe("UA1523");
  });

  // One flight, three spellings: the boarding pass pads it, AeroDataBox
  // spaces it, the departure board does neither. They have to collapse
  // onto one string or the lookup silently never matches.
  it("collapses the spellings of one flight number onto each other", () => {
    for (const typed of ["KL0765", "KL 765", "kl765", " KL0765 "]) {
      expect(formatFlightNumber(typed)).toBe("KL765");
    }
    expect(formatFlightNumber("AA0001")).toBe("AA1");
    expect(formatFlightNumber("KL765a")).toBe("KL765A");
  });

  it("leaves something it doesn't recognise alone rather than mangling it", () => {
    expect(formatFlightNumber("not a flight")).toBe("NOTAFLIGHT");
  });
});
