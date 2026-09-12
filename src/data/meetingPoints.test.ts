import { describe, it, expect } from "vitest";
import { meetingPointFor } from "./meetingPoints";

describe("Meeting points", () => {
  // An address gets a driver to a property. This is the last hundred
  // metres, which is where transfers actually go wrong.
  it("knows the airport is not the taxi rank", () => {
    const m = meetingPointFor("Queen Beatrix International Airport");
    expect(m?.at).toMatch(/arrivals/i);
    expect(m?.how).toMatch(/not the taxi rank/i);
  });

  it("falls back to what is true of every resort rather than saying nothing", () => {
    expect(meetingPointFor("The Ritz-Carlton Aruba")?.at).toBe("Main lobby entrance");
    expect(meetingPointFor("Bucuti & Tara Beach Resort")?.at).toBe("Main lobby entrance");
  });

  // Cabby's has no standing knowledge of a private address, and inventing
  // "main entrance" for somebody's house is filling a field, not
  // answering a question. The ride screen shows nothing rather than a
  // guess the driver would learn to distrust.
  it("says nothing about a place it has never heard of", () => {
    expect(meetingPointFor("Villa Sunrise 14, Palm Beach")).toBeNull();
    expect(meetingPointFor("")).toBeNull();
  });

  it("matches the name exactly as a ride stores it, whatever the casing", () => {
    expect(meetingPointFor("  queen beatrix international airport  ")).not.toBeNull();
  });
});
