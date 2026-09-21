import { describe, it, expect, beforeEach } from "vitest";
import {
  arrivalFor, arrivalsFor, clearFlightCache, driftMinutes, expectedAt, flightTrackingEnabled,
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

describe("asking about a whole board at once", () => {
  /** A provider that answers in bulk, and counts its round trips. */
  function bulk(answers: Record<string, FlightStatus | null>, calls = { n: 0, one: 0 }) {
    const p: FlightProvider = {
      name: "bulk", enabled: true,
      lookup: async (f, d) => { calls.one++; return answers[`${f}|${d}`] ?? null; },
      lookupMany: async (keys) => {
        calls.n++;
        const m = new Map<string, FlightStatus | null>();
        for (const k of keys) m.set(`${k.flight}|${k.day}`, answers[`${k.flight}|${k.day}`] ?? null);
        return m;
      },
    };
    return { p, calls };
  }

  it("asks about thirty flights in one round trip", async () => {
    const { p, calls } = bulk({ "KL765|2026-09-17": row() });
    useFlightProvider(p);
    const keys = Array.from({ length: 30 }, (_, i) => ({ flight: `AA${100 + i}`, day: "2026-09-17" }));
    keys.push({ flight: "KL765", day: "2026-09-17" });
    const known = await arrivalsFor(keys);
    expect(calls.n).toBe(1);
    expect(calls.one).toBe(0);
    expect(known.get("KL765|2026-09-17")?.flight).toBe("KL765");
  });

  // Two cars off one KLM arrival is one question, not two. On an island
  // where a single wide-body fills three transfers, this is the ordinary
  // case rather than an edge one.
  it("collapses duplicate flights and normalises however they were typed", async () => {
    const { p, calls } = bulk({ "KL765|2026-09-17": row() });
    useFlightProvider(p);
    let asked: string[] = [];
    p.lookupMany = async (keys) => {
      calls.n++;
      asked = keys.map((k) => `${k.flight}|${k.day}`);
      return new Map([["KL765|2026-09-17", row()]]);
    };
    await arrivalsFor([
      { flight: "KL765", day: "2026-09-17" },
      { flight: "kl 0765", day: "2026-09-17" },
      { flight: "KL765", day: "2026-09-17" },
    ]);
    expect(asked).toEqual(["KL765|2026-09-17"]);
  });

  // The bulk path goes THROUGH the cache, not around it. A board that
  // re-reads its rides after a write must not re-buy the morning.
  it("answers a repeat from the cache without asking anyone", async () => {
    const { p, calls } = bulk({ "KL765|2026-09-17": row() });
    useFlightProvider(p);
    const keys = [{ flight: "KL765", day: "2026-09-17" }];
    await arrivalsFor(keys);
    await arrivalsFor(keys);
    expect(calls.n).toBe(1);
  });

  // A ride view opening while the board is still loading must join the
  // read in progress rather than start a second one.
  it("lets a single lookup join a bulk read already in flight", async () => {
    const { p, calls } = bulk({ "KL765|2026-09-17": row() });
    useFlightProvider(p);
    const many = arrivalsFor([{ flight: "KL765", day: "2026-09-17" }]);
    const one = arrivalFor("KL765", "2026-09-17");
    const [, single] = await Promise.all([many, one]);
    expect(calls.n).toBe(1);
    expect(calls.one).toBe(0);
    expect(single?.flight).toBe("KL765");
  });

  // Same budget rule as arrivalFor, and the same reason: a board that
  // re-renders must not be able to retry a dead vendor into the ground.
  it("caches a bulk miss, and a bulk failure, as a miss", async () => {
    const { p, calls } = bulk({});
    useFlightProvider(p);
    await arrivalsFor([{ flight: "KL765", day: "2026-09-17" }]);
    await arrivalsFor([{ flight: "KL765", day: "2026-09-17" }]);
    expect(calls.n).toBe(1);

    clearFlightCache();
    let thrown = 0;
    useFlightProvider({
      name: "bad", enabled: true,
      lookup: async () => null,
      lookupMany: async () => { thrown++; throw new Error('relation "flight_status" does not exist'); },
    });
    const known = await arrivalsFor([{ flight: "KL765", day: "2026-09-17" }]);
    expect(known.size).toBe(0);
    await arrivalsFor([{ flight: "KL765", day: "2026-09-17" }]);
    expect(thrown).toBe(1);
  });

  // A vendor with no bulk path is asked one at a time — correct, merely
  // slower — and arrivalFor's cache and dedupe still apply.
  it("falls back to one call per flight when the vendor has no bulk path", async () => {
    const calls = { n: 0 };
    useFlightProvider(provider(row(), calls));
    const known = await arrivalsFor([
      { flight: "KL765", day: "2026-09-17" },
      { flight: "AA123", day: "2026-09-17" },
    ]);
    expect(calls.n).toBe(2);
    expect(known.size).toBe(2);
  });

  // The silent case, and the one the board is built around: nothing
  // known is an empty map, never a map of nulls for a screen to draw
  // boxes from.
  it("returns nothing at all when nobody can say", async () => {
    useFlightProvider(NO_PROVIDER);
    const known = await arrivalsFor([{ flight: "KL765", day: "2026-09-17" }]);
    expect(known.size).toBe(0);
    expect([...known.keys()]).toEqual([]);
  });

  // A ride with no date on it has no day to ask about, and asking is
  // the only thing that costs anything. (The shape of the NUMBER is
  // gated one layer up, where the board decides what is worth asking —
  // see flightWatch.test.ts — because arrivalFor has always taken
  // whatever it was handed and this must not diverge from it.)
  it("asks about nothing when there is no day to ask about", async () => {
    const { p, calls } = bulk({});
    useFlightProvider(p);
    const known = await arrivalsFor([{ flight: "KL765", day: "" }]);
    expect(known.size).toBe(0);
    expect(calls.n).toBe(0);
  });
});
