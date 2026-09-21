import { describe, it, expect } from "vitest";
import { flightKeyFor, flightKeysFor, flightsByRide } from "./flightWatch";
import { makeRide } from "./fixtures";
import { effectiveScheduledAt } from "../../driver/lib/driver";
import { pickupInstant } from "../../lib/pickupPin";
import type { FlightStatus } from "../../lib/flightStatus";

/** A fixed minute, so a window means the same thing on every run. */
const NOW = Date.parse("2026-09-01T18:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

/**
 * The CANONICAL name, which is what a booking actually stores and what
 * findPlaceByName matches on. "Queen Beatrix Airport" resolves to
 * nothing and would exercise the address path — a test written with it
 * passes for the wrong reason.
 */
const AUA = "Queen Beatrix International Airport";

const row = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL765", alsoKnownAs: [], scheduled: "2026-09-01T18:35:00.000Z",
  estimated: null, predicted: null, actual: null, state: "scheduled",
  terminal: null, aircraft: null, airline: "KLM", live: true, ...over,
});

describe("what the board asks the flight table about", () => {
  it("asks about an arrival at AUA with a number on it", () => {
    const r = makeRide({ pickup: AUA, flightNumber: "kl 0765", scheduledAt: at(120) });
    expect(flightKeyFor(r)).toEqual({ flight: "KL765", day: "2026-09-01" });
  });

  // On a run TO the airport the number is a DEPARTURE. Looked up as an
  // arrival it is either nothing or, worse, that morning's inbound leg
  // reported as tonight's landing to somebody who is not on it.
  it("never asks about a run to the airport", () => {
    const r = makeRide({
      pickup: "The Ritz-Carlton Aruba", dropoff: AUA,
      flightNumber: "KL766", scheduledAt: at(120),
    });
    expect(flightKeyFor(r)).toBeNull();
  });

  // The short form resolves to no place at all, so it takes the address
  // path — which is exactly why some older fixtures in this repo are
  // green for the wrong reason.
  it("does not treat 'Queen Beatrix Airport' as the airport", () => {
    const r = makeRide({ pickup: "Queen Beatrix Airport", flightNumber: "KL765", scheduledAt: at(120) });
    expect(flightKeyFor(r)).toBeNull();
  });

  // A real value in this column, and it must not reach a query string
  // or a meter.
  it("ignores a flight number that is not one", () => {
    const r = makeRide({ pickup: AUA, flightNumber: "I'll text you my flight", scheduledAt: at(120) });
    expect(flightKeyFor(r)).toBeNull();
  });

  it("ignores a ride with no number and a ride with no date", () => {
    expect(flightKeyFor(makeRide({ pickup: AUA, flightNumber: null, scheduledAt: at(120) }))).toBeNull();
    expect(flightKeyFor(makeRide({ pickup: AUA, flightNumber: "KL765", scheduledAt: null }))).toBeNull();
  });

  /**
   * THE SHAPE THE BOOKING FLOW ACTUALLY WRITES.
   *
   * bookingPayload.ts stores scheduled_date + scheduled_time and leaves
   * scheduled_at NULL on every row a guest has ever created. A day read
   * off the raw instant is empty for every real booking, and this whole
   * feature would be silent for everybody while looking healthy — which
   * is precisely how the pickup-pin button shipped invisible. The board
   * and the guest's card must derive the same instant from the pair, or
   * they ask about different days and one of them shows nothing.
   */
  it("keys the day off the pair the booking flow writes, not off scheduled_at", () => {
    const written = { scheduled_at: null, scheduled_date: "2026-09-02", scheduled_time: "23:30" };

    // Late enough on the island that UTC has already rolled over — the
    // anchoring is the part that goes wrong silently.
    expect(effectiveScheduledAt(written)).toBe("2026-09-03T03:30:00.000Z");
    // The board's loader and the guest's card, agreeing by construction.
    expect(effectiveScheduledAt(written)).toBe(pickupInstant(written));

    const r = makeRide({
      pickup: AUA, flightNumber: "KL765", scheduledAt: effectiveScheduledAt(written),
    });
    expect(flightKeyFor(r)).toEqual({ flight: "KL765", day: "2026-09-02" });

    // And the trap itself: the instant alone is null on that row, and a
    // ride built from it asks about nothing.
    expect(flightKeyFor(makeRide({ pickup: AUA, flightNumber: "KL765", scheduledAt: written.scheduled_at })))
      .toBeNull();
  });
});

describe("how much of the board is worth asking about", () => {
  // Two cars off one KLM arrival is one question. On this island that is
  // the ordinary case, not an edge one.
  it("asks once for two rides off the same flight", () => {
    const keys = flightKeysFor([
      makeRide({ id: "a", pickup: AUA, flightNumber: "KL765", scheduledAt: at(120) }),
      makeRide({ id: "b", pickup: AUA, flightNumber: "KL0765", scheduledAt: at(150) }),
    ], NOW);
    expect(keys).toEqual([{ flight: "KL765", day: "2026-09-01" }]);
  });

  // flight_status is filled as a pickup approaches. A ride three weeks
  // out has no row and cannot have one, so asking widens the query for
  // an answer that does not exist.
  it("leaves rides beyond the window alone", () => {
    const keys = flightKeysFor([
      makeRide({ id: "far", pickup: AUA, flightNumber: "KL765", scheduledAt: at(60 * 48) }),
      makeRide({ id: "old", pickup: AUA, flightNumber: "AA123", scheduledAt: at(-60 * 5) }),
    ], NOW);
    expect(keys).toEqual([]);
  });

  // A flight cancelled forty minutes ago is still the most urgent thing
  // on the board: the guest is not coming and somebody may be driving to
  // the airport for them.
  it("keeps a pickup that has only just passed", () => {
    const keys = flightKeysFor(
      [makeRide({ pickup: AUA, flightNumber: "KL765", scheduledAt: at(-40) })], NOW,
    );
    expect(keys).toHaveLength(1);
  });

  // A ride that is over is not work, whatever its flight did — and this
  // is what makes an item disappear once an operator deals with it.
  it("stops asking about a ride that has been cancelled or driven", () => {
    const keys = flightKeysFor([
      makeRide({ id: "x", status: "cancelled", pickup: AUA, flightNumber: "KL765", scheduledAt: at(120) }),
      makeRide({ id: "y", status: "completed", pickup: AUA, flightNumber: "AA123", scheduledAt: at(120) }),
    ], NOW);
    expect(keys).toEqual([]);
  });

  it("asks about nothing on a board with no airport arrivals on it", () => {
    const keys = flightKeysFor([makeRide({ pickup: "Eagle Beach", flightNumber: null })], NOW);
    expect(keys).toEqual([]);
  });
});

describe("hanging the answers back on the rides", () => {
  it("gives each ride off the flight the same row", () => {
    const rides = [
      makeRide({ id: "a", pickup: AUA, flightNumber: "KL765", scheduledAt: at(120) }),
      makeRide({ id: "b", pickup: AUA, flightNumber: "kl 765", scheduledAt: at(150) }),
    ];
    const by = flightsByRide(rides, new Map([["KL765|2026-09-01", row({ state: "cancelled" })]]));
    expect(by.get("a")?.state).toBe("cancelled");
    expect(by.get("b")?.state).toBe("cancelled");
  });

  // A departure must not inherit an arrival's status just because the
  // two numbers happened to match.
  it("never hangs an arrival on a run to the airport", () => {
    const rides = [makeRide({ id: "out", pickup: "Eagle Beach", dropoff: AUA, flightNumber: "KL765", scheduledAt: at(120) })];
    expect(flightsByRide(rides, new Map([["KL765|2026-09-01", row()]])).size).toBe(0);
  });

  // The ordinary state, and the one the board is designed around.
  it("is empty when nothing is known", () => {
    const rides = [makeRide({ pickup: AUA, flightNumber: "KL765", scheduledAt: at(120) })];
    expect(flightsByRide(rides, new Map()).size).toBe(0);
  });
});
