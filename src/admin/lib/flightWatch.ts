// Which rides the board asks the flight table about — and only those.
//
// The attention list is computed from rides, synchronously, from data
// already on screen. Flight status is not: it lives in another table and
// arrives later. This file is the seam between the two, and it exists so
// that the asking is done ONCE, for a bounded set of rides, rather than
// one query per row inside a component that re-renders.
//
// Three gates, and each one is a cost that would otherwise be paid for
// nothing:
//
//  · ARRIVALS ONLY. On a run TO the airport the number the guest typed
//    is a DEPARTURE, and arrivalFor() would look it up as an arrival —
//    best case a null, worst case yesterday's inbound leg reported as
//    tonight's landing to somebody who is not on it. pinPolicyFor() is
//    the same test the guest's trip card uses, so the two sides of the
//    company cannot disagree about which pickups are at AUA.
//
//  · A NUMBER THAT IS A NUMBER. "I'll text you my flight" is a real
//    value in this column. isValidFlightNumber keeps it out of the key
//    set, out of the URL, and out of the meter.
//
//  · A WINDOW. The scheduled function fills flight_status as a pickup
//    approaches; a ride three weeks out has no row and never will yet,
//    so asking about it widens the query for an answer that cannot
//    exist. The window is the only reason this scales to a board that
//    holds four hundred rides.
import { arubaDayOf } from "../../lib/datetime";
import { formatFlightNumber, isValidFlightNumber } from "../../lib/flight";
import { pinPolicyFor } from "../../lib/pickupPin";
import { flightKey, type FlightKey, type FlightStatus } from "../../lib/flightStatus";
import { isClosed, type AdminRide } from "./admin";

/**
 * How far ahead the board watches flights.
 *
 * The same twenty-four hours the attention list gives an unassigned
 * ride, and for the same reason: past a day out, nothing on this board
 * is today's work. It is also about as far ahead as an airline revises
 * an arrival with any confidence.
 */
export const WATCH_AHEAD_HOURS = 24;

/**
 * And how far behind.
 *
 * A flight cancelled forty minutes ago is still the most urgent thing on
 * the board — the guest is not coming and somebody is driving to the
 * airport. Two hours is past the point where a pickup either happened or
 * became a different conversation.
 */
export const WATCH_BEHIND_MINUTES = 120;

/**
 * What to ask about this ride, or null when there is nothing to ask.
 *
 * The day is taken from the ride's own scheduledAt, which the loaders
 * derive with effectiveScheduledAt() — scheduled_date + scheduled_time
 * first, the instant only as a fallback. That order is not a detail:
 * bookingPayload.ts leaves scheduled_at NULL on every row a guest has
 * ever created, so a day read off the raw instant would be empty for
 * every real booking and this whole feature would be silent for
 * everybody while looking perfectly healthy. That exact mistake shipped
 * the pickup-pin button that never appeared. pickupInstant() is the same
 * arithmetic on the guest's side, and flightWatch.test.ts pins the two
 * together so they cannot drift.
 */
export function flightKeyFor(r: AdminRide): FlightKey | null {
  if (!r.flightNumber || !isValidFlightNumber(r.flightNumber)) return null;
  if (pinPolicyFor(r.pickup) !== "airport") return null;
  const day = arubaDayOf(r.scheduledAt);
  if (!day) return null;
  return { flight: formatFlightNumber(r.flightNumber), day };
}

/**
 * Every question the board has, deduped — two cars off one KLM arrival
 * is one question, which on this island is the ordinary case.
 */
export function flightKeysFor(rides: AdminRide[], now: number = Date.now()): FlightKey[] {
  const out = new Map<string, FlightKey>();
  for (const r of rides) {
    // A ride that is over is not work, whatever its flight did. This is
    // also what makes the attention items disappear when an operator
    // deals with one: they cancel the ride, and the question stops
    // being asked.
    if (isClosed(r)) continue;
    const t = r.scheduledAt ? Date.parse(r.scheduledAt) : NaN;
    if (Number.isNaN(t)) continue;
    if (t < now - WATCH_BEHIND_MINUTES * 60_000) continue;
    if (t > now + WATCH_AHEAD_HOURS * 3_600_000) continue;
    const k = flightKeyFor(r);
    if (k) out.set(flightKey(k.flight, k.day), k);
  }
  return [...out.values()];
}

/**
 * The answers, re-hung on the rides they are about.
 *
 * attentionItems() is pure and takes rides; handing it a map keyed by
 * ride id keeps the flight-number arithmetic out of it entirely, so the
 * list stays one function of one set of inputs that a test can pin to a
 * fixed minute.
 *
 * Only rides that pass the same gates get an entry. A ride TO the
 * airport must not inherit an arrival's status just because the numbers
 * matched.
 */
export function flightsByRide(
  rides: AdminRide[],
  known: Map<string, FlightStatus>,
): Map<string, FlightStatus> {
  const out = new Map<string, FlightStatus>();
  for (const r of rides) {
    const k = flightKeyFor(r);
    if (!k) continue;
    const f = known.get(flightKey(k.flight, k.day));
    if (f) out.set(r.id, f);
  }
  return out;
}
