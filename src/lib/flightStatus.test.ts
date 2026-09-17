import { describe, it, expect, beforeEach } from "vitest";
import {
  arrivalFor, clearFlightCache, driftMinutes, expectedAt, flightTrackingEnabled,
  NO_PROVIDER, predictedOnly, useFlightProvider, worthSaying,
  type FlightProvider, type FlightStatus,
} from "./flightStatus";

const row = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL765", alsoKnownAs: [], scheduled: "2026-09-17T21:55:00.000Z",
  estimated: null, predicted: null, actual: null, state: "scheduled",
  terminal: null, aircraft: null, airline: null, live: false, ...over,
});

function provider(answer: FlightStatus | null, calls = { n: 0 }): FlightProvider {
  return { name: "test", enabled: true, lookup: async () => { calls.n++; return answer; } };
}

beforeEach(() => { useFlightProvider(NO_PROVIDER); clearFlightCache(); });

describe("with no key set", () => {
  // The shipping default, not a stub. Every screen has to look right
  // against this, because it is what runs until a key exists.
  it("answers nothing and says it is switched off", async () => {
    expect(flightTrackingEnabled()).toBe(false);
    expect(await arrivalFor("KL765", "2026-09-17")).toBeNull();
  });
});

describe("asking", () => {
  it("normalises however the guest typed it before asking", async () => {
    let asked = "";
    useFlightProvider({
      name: "t", enabled: true,
      lookup: async (f) => { asked = f; return row(); },
    });
    await arrivalFor("kl 0765", "2026-09-17");
    expect(asked).toBe("KL765");
  });

  it("survives a provider that throws", async () => {
    useFlightProvider({
      name: "bad", enabled: true,
      lookup: async () => { throw new Error("429 quota exceeded"); },
    });
    expect(await arrivalFor("KL765", "2026-09-17")).toBeNull();
  });
});

describe("spending units", () => {
  // On a 400-unit month the cache is the budget, not a nicety.
  it("asks once however many screens want the same flight", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider(row(), calls));
    await Promise.all([1, 2, 3, 4].map(() => arrivalFor("KL765", "2026-09-17")));
    await arrivalFor("KL765", "2026-09-17");
    expect(calls.n).toBe(1);
  });

  it("caches a miss too, so a dead vendor isn't retried into the ground", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider(null, calls));
    await arrivalFor("KL765", "2026-09-17");
    await arrivalFor("KL765", "2026-09-17");
    expect(calls.n).toBe(1);
  });

  it("asks again once it is stale", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider(row(), calls));
    const t = Date.parse("2026-09-17T12:00:00.000Z");
    await arrivalFor("KL765", "2026-09-17", t);
    await arrivalFor("KL765", "2026-09-17", t + 60_000);
    expect(calls.n).toBe(1);
    await arrivalFor("KL765", "2026-09-17", t + 11 * 60_000);
    expect(calls.n).toBe(2);
  });

  it("keeps separate flights and separate days apart", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider(row(), calls));
    await arrivalFor("KL765", "2026-09-17");
    await arrivalFor("KL765", "2026-09-18");
    await arrivalFor("AA123", "2026-09-17");
    expect(calls.n).toBe(3);
  });
});

describe("four clocks, ranked by who said it", () => {
  it("prefers the ground, then the airline, then the model, then the timetable", () => {
    expect(expectedAt(row())).toBe("2026-09-17T21:55:00.000Z");
    expect(expectedAt(row({ predicted: "2026-09-17T21:40:00.000Z" })))
      .toBe("2026-09-17T21:40:00.000Z");
    expect(expectedAt(row({
      predicted: "2026-09-17T21:40:00.000Z", estimated: "2026-09-17T22:30:00.000Z",
    }))).toBe("2026-09-17T22:30:00.000Z");
    expect(expectedAt(row({
      predicted: "2026-09-17T21:40:00.000Z", estimated: "2026-09-17T22:30:00.000Z",
      actual: "2026-09-17T22:18:00.000Z",
    }))).toBe("2026-09-17T22:18:00.000Z");
  });

  // A driver acts differently on "KLM says 22:30" and "a model thinks
  // 21:40". A screen that renders them identically is hiding the
  // difference, so the flag exists to make the caller choose.
  it("flags the case where only a model has spoken", () => {
    expect(predictedOnly(row({ predicted: "2026-09-17T21:40:00.000Z" }))).toBe(true);
    expect(predictedOnly(row({
      predicted: "2026-09-17T21:40:00.000Z", estimated: "2026-09-17T22:30:00.000Z",
    }))).toBe(false);
    expect(predictedOnly(row())).toBe(false);
  });

  // Null is not zero. "No idea" rendered as "on time" is an invention.
  it("says nothing rather than 'on time' when it cannot compare", () => {
    expect(driftMinutes(row())).toBeNull();
    expect(driftMinutes(row({ scheduled: null, estimated: "2026-09-17T22:30:00.000Z" }))).toBeNull();
    expect(driftMinutes(row({ estimated: "2026-09-17T22:30:00.000Z" }))).toBe(35);
    expect(driftMinutes(row({ predicted: "2026-09-17T21:40:00.000Z" }))).toBe(-15);
  });

  it("only speaks up when it changes what a driver would do", () => {
    expect(worthSaying(row({ estimated: "2026-09-17T21:59:00.000Z" }))).toBe(false);
    expect(worthSaying(row({ estimated: "2026-09-17T22:30:00.000Z" }))).toBe(true);
    expect(worthSaying(row())).toBe(false);
    expect(worthSaying(row({ state: "cancelled" }))).toBe(true);
    expect(worthSaying(row({ state: "diverted" }))).toBe(true);
  });
});
