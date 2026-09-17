import { describe, it, expect } from "vitest";
import {
  legArrivingAt, lookupFlight, mapLeg, mapState, parseAeroTime, readArrival,
  type AeroLeg,
} from "./aerodatabox";
import { expectedAt, predictedOnly, driftMinutes } from "../flightStatus";
import KL765 from "./__fixtures__/kl765.json";

// The real response to the first live call this project ever made:
// KL765 on 17 September 2026, AMS → AUA → BON → AMS. Kept verbatim,
// because every trap below was found in it rather than imagined.
const legs = KL765 as AeroLeg[];

describe("the timestamps are not valid dates", () => {
  // AeroDataBox sends a space where ISO 8601 requires a T. V8 forgives
  // it, so this parses in Chrome and in this very test runner; Safari
  // returns Invalid Date. The driver portal is used on iPhones.
  it("repairs the space that Safari refuses", () => {
    expect(parseAeroTime("2026-09-17 21:55Z")).toBe("2026-09-17T21:55:00.000Z");
    expect(parseAeroTime("2026-09-17 17:55-04:00")).toBe("2026-09-17T21:55:00.000Z");
  });

  // Returning an Invalid Date would let NaN reach a screen as a time.
  it("gives null rather than an unusable date", () => {
    expect(parseAeroTime("not a time")).toBeNull();
    expect(parseAeroTime(undefined)).toBeNull();
    expect(parseAeroTime("")).toBeNull();
  });
});

describe("one flight number is a rotation, not a flight", () => {
  it("sees three legs under one number", () => {
    expect(legs).toHaveLength(3);
  });

  // Aruba appears TWICE — once arriving, once departing. This is the
  // whole trap: picking the leg that merely mentions Aruba gets the
  // 19:15 departure for a guest whose plane lands at 17:55.
  it("picks the leg that LANDS here, not the one that leaves", () => {
    const leg = legArrivingAt(legs);
    expect(leg?.departure?.airport?.iata).toBe("AMS");
    expect(leg?.arrival?.airport?.iata).toBe("AUA");
  });

  it("does not hand a driver the onward departure to Bonaire", () => {
    const f = readArrival(legs);
    // 21:55Z is 17:55 in Aruba — the landing. 23:15Z is the 19:15
    // departure, eighty minutes later, and a guest at the kerb.
    expect(f?.scheduled).toBe("2026-09-17T21:55:00.000Z");
    expect(f?.scheduled).not.toBe("2026-09-17T23:15:00.000Z");
  });

  it("returns nothing when this rotation never lands here", () => {
    expect(readArrival(legs, "EGLL")).toBeNull();
    expect(readArrival(null)).toBeNull();
    expect(readArrival({ not: "an array" })).toBeNull();
  });
});

describe("reading the leg that matters", () => {
  const f = readArrival(legs)!;

  it("collapses the spaced number onto what the guest typed", () => {
    expect(f.flight).toBe("KL765");
  });

  it("keeps the four clocks apart", () => {
    expect(f.scheduled).toBe("2026-09-17T21:55:00.000Z");
    // revisedTime here merely echoes the timetable, so nobody has
    // actually revised anything and estimated stays null.
    expect(f.estimated).toBeNull();
    expect(f.predicted).toBe("2026-09-17T21:40:00.000Z");
    expect(f.actual).toBeNull();
  });

  // The live call's actual numbers: a model says fifteen minutes early
  // against an unchanged schedule. Worth showing, never as a fact.
  it("reads as 'fifteen early, but only a model says so'", () => {
    expect(expectedAt(f)).toBe("2026-09-17T21:40:00.000Z");
    expect(driftMinutes(f)).toBe(-15);
    expect(predictedOnly(f)).toBe(true);
  });

  it("carries what the driver and the board can use", () => {
    expect(f.state).toBe("scheduled");
    expect(f.airline).toBe("KLM");
    expect(f.aircraft).toBe("Airbus A330");
    expect(f.live).toBe(true);
  });
});

describe("an echoed revision is not a revision", () => {
  // Passing revisedTime straight through would make every flight look
  // confirmed by a human when none of them has been.
  it("only counts a revision that moves the time", () => {
    const moved = mapLeg({
      number: "KL 765", status: "Delayed",
      arrival: {
        airport: { icao: "TNCA" },
        scheduledTime: { utc: "2026-09-17 21:55Z" },
        revisedTime: { utc: "2026-09-17 22:40Z" },
      },
    });
    expect(moved?.estimated).toBe("2026-09-17T22:40:00.000Z");
    expect(predictedOnly(moved!)).toBe(false);
    expect(moved?.state).toBe("delayed");
  });
});

describe("statuses this app has never seen", () => {
  // Passing an unknown status through would let a screen style it as
  // though it recognised it.
  it("maps what it knows and refuses to guess at the rest", () => {
    expect(mapState("Expected")).toBe("scheduled");
    expect(mapState("EnRoute")).toBe("scheduled");
    expect(mapState("Delayed")).toBe("delayed");
    expect(mapState("Arrived")).toBe("landed");
    expect(mapState("Canceled")).toBe("cancelled");
    expect(mapState("Diverted")).toBe("diverted");
    expect(mapState("SomethingNew")).toBe("unknown");
    expect(mapState(undefined)).toBe("unknown");
  });
});

describe("the call itself", () => {
  const key = "not-a-real-key";

  it("asks for the normalised number and never leaks the key into the URL", async () => {
    let seen = "";
    let headers: Record<string, string> = {};
    await lookupFlight("kl 0765", "2026-09-17", {
      key,
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = url;
        headers = init.headers as Record<string, string>;
        return { ok: true, status: 200, json: async () => legs };
      }) as unknown as typeof fetch,
    });
    expect(seen).toContain("/flights/Number/KL765/2026-09-17");
    expect(seen).not.toContain(key);
    expect(headers["x-rapidapi-key"]).toBe(key);
  });

  // A mistyped number, or a flight that does not operate that day. An
  // answer, not a fault — same shape as every other miss.
  it("treats 404 as 'no such flight', not as an error", async () => {
    const f = await lookupFlight("XX999", "2026-09-17", {
      key,
      fetchImpl: (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch,
    });
    expect(f).toBeNull();
  });

  // A spent quota or a dead vendor must be distinguishable upstream from
  // a flight that isn't there, so the caller can back off rather than
  // hammer it. flightStatus.ts catches this and caches the miss.
  it("throws on a spent quota rather than pretending there is no flight", async () => {
    await expect(lookupFlight("KL765", "2026-09-17", {
      key,
      fetchImpl: (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch,
    })).rejects.toThrow(/429/);
  });
});
