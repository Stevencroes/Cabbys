import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  arrivalFor, clearFlightCache, driftMinutes, expectedAt, flightTrackingEnabled,
  NO_PROVIDER, useFlightProvider, worthSaying, type FlightProvider, type FlightStatus,
} from "./flightStatus";

const row = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL767", alsoKnownAs: [], scheduled: "2026-09-20T17:45:00.000Z",
  estimated: null, actual: null, state: "scheduled", terminal: null, ...over,
});

function provider(rows: FlightStatus[] | null, calls = { n: 0 }): FlightProvider {
  return {
    name: "test", enabled: true,
    arrivals: async () => { calls.n++; return rows; },
  };
}

beforeEach(() => { useFlightProvider(NO_PROVIDER); clearFlightCache(); });

describe("with no key set", () => {
  // The shipping default, not a stub. Every screen has to look right
  // against this, because this is what it looks like today.
  it("answers nothing and says it is switched off", async () => {
    expect(flightTrackingEnabled()).toBe(false);
    expect(await arrivalFor("KL767", "2026-09-20")).toBeNull();
  });
});

describe("finding a flight on the board", () => {
  it("matches however the guest typed it", async () => {
    useFlightProvider(provider([row()]));
    for (const typed of ["KL767", "kl 767", " KL 767 "]) {
      clearFlightCache();
      expect((await arrivalFor(typed, "2026-09-20"))?.flight).toBe("KL767");
    }
  });

  // An Aruba arrival is routinely sold by three airlines at once, and the
  // guest types whichever is on their own ticket — not the one the
  // aircraft files under.
  it("matches a codeshare number", async () => {
    useFlightProvider(provider([row({ alsoKnownAs: ["DL9312", "AF1755"] })]));
    expect((await arrivalFor("DL9312", "2026-09-20"))?.flight).toBe("KL767");
  });

  it("returns nothing for a flight that isn't on the board", async () => {
    useFlightProvider(provider([row()]));
    expect(await arrivalFor("AA1234", "2026-09-20")).toBeNull();
  });

  // Null is a provider that could not answer; an empty array is a real
  // answer. A screen that treats them alike tells a driver there are no
  // flights today when the truth is that nobody asked successfully.
  it("keeps 'could not answer' apart from 'nothing arriving'", async () => {
    useFlightProvider(provider(null));
    expect(await arrivalFor("KL767", "2026-09-20")).toBeNull();
    clearFlightCache();
    useFlightProvider(provider([]));
    expect(await arrivalFor("KL767", "2026-09-20")).toBeNull();
  });

  it("survives a provider that throws", async () => {
    useFlightProvider({
      name: "bad", enabled: true,
      arrivals: async () => { throw new Error("402 quota exceeded"); },
    });
    expect(await arrivalFor("KL767", "2026-09-20")).toBeNull();
  });
});

describe("paying for one board, not one flight", () => {
  // The decision the whole file is shaped around: six pickups off the
  // same afternoon bank cost one call between them, not six.
  it("asks once for a day however many rides want it", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider([row()], calls));
    await Promise.all(["KL767", "AA1234", "JB891", "KL767"].map((f) => arrivalFor(f, "2026-09-20")));
    await arrivalFor("KL767", "2026-09-20");
    expect(calls.n).toBe(1);
  });

  it("asks again once the board is stale", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider([row()], calls));
    const t = Date.parse("2026-09-20T12:00:00.000Z");
    await arrivalFor("KL767", "2026-09-20", t);
    await arrivalFor("KL767", "2026-09-20", t + 60_000);
    expect(calls.n).toBe(1);
    await arrivalFor("KL767", "2026-09-20", t + 11 * 60_000);
    expect(calls.n).toBe(2);
  });

  it("keeps separate days apart", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider([row()], calls));
    await arrivalFor("KL767", "2026-09-20");
    await arrivalFor("KL767", "2026-09-21");
    expect(calls.n).toBe(2);
  });
});

describe("reading one", () => {
  it("plans around the best answer it has", () => {
    expect(expectedAt(row())).toBe("2026-09-20T17:45:00.000Z");
    expect(expectedAt(row({ estimated: "2026-09-20T18:20:00.000Z" }))).toBe("2026-09-20T18:20:00.000Z");
    expect(expectedAt(row({
      estimated: "2026-09-20T18:20:00.000Z", actual: "2026-09-20T18:12:00.000Z",
    }))).toBe("2026-09-20T18:12:00.000Z");
  });

  // Null is not zero. A screen rendering "no idea" as "on time" is
  // claiming something nobody told it.
  it("says nothing rather than 'on time' when it cannot compare", () => {
    expect(driftMinutes(row())).toBeNull();
    expect(driftMinutes(row({ scheduled: null, estimated: "2026-09-20T18:20:00.000Z" }))).toBeNull();
    expect(driftMinutes(row({ estimated: "2026-09-20T18:20:00.000Z" }))).toBe(35);
    expect(driftMinutes(row({ estimated: "2026-09-20T17:30:00.000Z" }))).toBe(-15);
  });

  // Four minutes late changes nobody's morning. Fifteen is where somebody
  // starts waiting at a kerb.
  it("only speaks up when it changes what a driver would do", () => {
    expect(worthSaying(row({ estimated: "2026-09-20T17:49:00.000Z" }))).toBe(false);
    expect(worthSaying(row({ estimated: "2026-09-20T18:20:00.000Z" }))).toBe(true);
    expect(worthSaying(row())).toBe(false);
    expect(worthSaying(row({ state: "cancelled" }))).toBe(true);
    expect(worthSaying(row({ state: "diverted" }))).toBe(true);
  });
});
