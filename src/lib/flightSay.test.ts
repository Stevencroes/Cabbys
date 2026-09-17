import { describe, it, expect } from "vitest";
import { flightSay } from "./flightSay";
import type { FlightStatus } from "./flightStatus";
import { readArrival } from "./providers/aerodatabox";
import KL765 from "./providers/__fixtures__/kl765.json";

/** stand-in for each portal's own Aruba clock — "21:55Z" → "17:55" */
const fmt = (iso: string) =>
  new Date(Date.parse(iso) - 4 * 3600_000).toISOString().slice(11, 16);

const row = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL765", alsoKnownAs: [], scheduled: "2026-09-17T21:55:00.000Z",
  estimated: null, predicted: null, actual: null, state: "scheduled",
  terminal: null, aircraft: null, airline: null, live: false, ...over,
});

describe("saying nothing", () => {
  // Not knowing is the ordinary case and it has one outcome: the guest's
  // own typed line stands, exactly as it does today.
  it("says nothing at all when nobody knows anything", () => {
    expect(flightSay(null, fmt)).toBeNull();
    expect(flightSay(row({ scheduled: null }), fmt)).toBeNull();
  });

  it("stays quiet when the flight is running to time", () => {
    const s = flightSay(row(), fmt)!;
    expect(s.tone).toBe("quiet");
    expect(s.head).toBe("Lands 17:55");
    expect(s.detail).toBeNull();
  });

  // Four minutes changes nobody's morning, and a line that moves for it
  // is a line drivers stop reading.
  it("stays quiet for a drift too small to act on", () => {
    const s = flightSay(row({ estimated: "2026-09-17T22:03:00.000Z" }), fmt)!;
    expect(s.tone).toBe("quiet");
    expect(s.detail).toBeNull();
  });
});

describe("when the airline moves it", () => {
  // A fact, so it becomes the headline and the timetable is the footnote.
  it("leads with the new time and names who moved it", () => {
    const s = flightSay(row({ estimated: "2026-09-17T22:40:00.000Z" }), fmt)!;
    expect(s.tone).toBe("warn");
    expect(s.head).toBe("Now lands 18:40");
    expect(s.detail).toMatch(/Scheduled 17:55/);
    expect(s.detail).toMatch(/airline/);
  });
});

describe("when only the model has spoken", () => {
  // The headline stays a time somebody is accountable for. The model
  // gets its own sentence with its own name on it.
  it("keeps the promised time as the headline", () => {
    const s = flightSay(row({ predicted: "2026-09-17T21:40:00.000Z" }), fmt)!;
    expect(s.head).toBe("Lands 17:55");
    expect(s.detail).toMatch(/Tracking expects 17:40/);
  });

  // A driver who waits has waited. A guest with no car is standing in an
  // arrivals hall in a country they reached twenty minutes ago. The two
  // costs are not equal, so the two directions do not read the same.
  it("tells a driver to act on an early signal", () => {
    const s = flightSay(row({ predicted: "2026-09-17T21:40:00.000Z" }), fmt)!;
    expect(s.detail).toMatch(/plan for the earlier one/i);
  });

  it("tells a driver not to lean on an unconfirmed late one", () => {
    const s = flightSay(row({ predicted: "2026-09-17T22:35:00.000Z" }), fmt)!;
    expect(s.detail).toMatch(/not confirmed/i);
    expect(s.detail).not.toMatch(/plan for the earlier/i);
  });

  // An airline's word outranks a model's, so the hedge disappears.
  it("drops the hedge once an airline has spoken", () => {
    const s = flightSay(row({
      predicted: "2026-09-17T21:40:00.000Z", estimated: "2026-09-17T22:40:00.000Z",
    }), fmt)!;
    expect(s.head).toBe("Now lands 18:40");
    expect(s.detail).not.toMatch(/Tracking/);
  });
});

describe("once it is on the ground", () => {
  it("says so, and how far off it was", () => {
    const s = flightSay(row({ actual: "2026-09-17T22:35:00.000Z" }), fmt)!;
    expect(s.head).toBe("Landed 18:35");
    expect(s.detail).toBe("40 min late");
  });

  it("adds nothing when it landed on time", () => {
    const s = flightSay(row({ actual: "2026-09-17T21:58:00.000Z" }), fmt)!;
    expect(s.head).toBe("Landed 17:58");
    expect(s.detail).toBeNull();
  });
});

describe("when there is no flight to meet", () => {
  // The two cases where the right action is to NOT drive, so they are the
  // only two that get the alert tone.
  it("is loud about a cancellation, and says not to drive", () => {
    const s = flightSay(row({ state: "cancelled" }), fmt)!;
    expect(s.tone).toBe("alert");
    expect(s.head).toBe("Flight cancelled");
    expect(s.detail).toMatch(/Don't drive/);
  });

  it("is loud about a diversion", () => {
    const s = flightSay(row({ state: "diverted" }), fmt)!;
    expect(s.tone).toBe("alert");
    expect(s.detail).toMatch(/isn't landing in Aruba/);
  });
});

describe("against the real response", () => {
  // End to end on the live KL765 call: the AMS→AUA leg, a schedule
  // nobody moved, and a model fifteen minutes early.
  it("reads the live call as 'lands 17:55, tracking says 17:40'", () => {
    const s = flightSay(readArrival(KL765), fmt)!;
    expect(s.tone).toBe("warn");
    expect(s.head).toBe("Lands 17:55");
    expect(s.detail).toBe("Tracking expects 17:40 — plan for the earlier one.");
  });
});
