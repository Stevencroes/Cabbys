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
});
