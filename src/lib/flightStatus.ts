// ── Flight status: when the plane actually lands ──────────────────────
//
// Today a ride carries the flight number the guest typed and nothing
// else, so "Flight lands 1:45 PM AST" on the driver's screen is a
// sentence a guest wrote weeks ago. This turns it into something Cabby's
// knows — and, when it doesn't know, leaves exactly the sentence that is
// there now rather than replacing it with a worse guess.
//
// ── Why this fetches a BOARD and not a FLIGHT ─────────────────────────
//
// The obvious shape is "look up AA1234". It is also the expensive one:
// one call per ride per refresh, which is how a free quota is spent in a
// week. Cabby's has exactly one airport. So this asks the only question
// that scales — "what is arriving at AUA today" — once, caches it, and
// matches every ride against it locally. Six pickups off the same
// afternoon bank cost one call between them instead of six.
//
// That single decision is what makes a free tier workable, and it is why
// the provider interface below is arrivals(day) rather than flight(no).
//
// ── Why the provider is behind a seam ─────────────────────────────────
//
// Flight data is licensed, every vendor prices it differently, and the
// cheap one today is not the cheap one next year. Nothing outside this
// file knows which vendor answered — screens ask arrivalFor() and get a
// FlightStatus or null. Changing vendor is implementing one function.
//
// ── Fail soft, like everything else that needs a key ──────────────────
//
// No key, dead network, unknown flight number, a board that came back
// empty: all end at null, and null means "show the guest's own words".
// This never blocks a booking, never blocks a driver, and never invents
// a time. A transfer service that sends a car on a guessed landing is
// worse off than one that sends it on the schedule.
import { formatFlightNumber } from "./flight";

/** What every provider must answer with, whatever shape it speaks. */
export interface FlightStatus {
  /** canonical, e.g. "KL767" */
  flight: string;
  /** every number this same aircraft is sold under — codeshares matter
      here more than most places: an Aruba arrival is routinely sold by
      three airlines at once, and the guest types whichever is on their
      own ticket. */
  alsoKnownAs: string[];
  /** ISO instants. scheduled is the timetable; estimated is the current
      best answer; actual is set once it is on the ground. */
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  state: FlightState;
  terminal: string | null;
}

export type FlightState =
  | "scheduled" | "delayed" | "early" | "landed" | "cancelled" | "diverted" | "unknown";

export interface FlightProvider {
  name: string;
  enabled: boolean;
  /** Everything arriving at AUA on this Aruba calendar day, or null if
      the provider could not answer. Null is never an empty board — an
      empty board is a real answer and a null is a failure, and treating
      one as the other is how a screen says "no flights today". */
  arrivals(day: string): Promise<FlightStatus[] | null>;
}

/**
 * The provider with no key behind it.
 *
 * Not a stub to be replaced — it is the shipping default until somebody
 * sets a key, and every screen is built to look right against it.
 */
export const NO_PROVIDER: FlightProvider = {
  name: "none",
  enabled: false,
  arrivals: async () => null,
};

let provider: FlightProvider = NO_PROVIDER;

/** Swap the vendor in. Called once at startup, and by tests. */
export function useFlightProvider(p: FlightProvider): void {
  provider = p;
  board.clear();
}

export function flightTrackingEnabled(): boolean {
  return provider.enabled;
}

// ── the cache ────────────────────────────────────────────────────────
// Per Aruba day, in memory. Short enough that a delay announced ten
// minutes ago is visible, long enough that six screens open at once cost
// one call. Deliberately NOT localStorage: a stale landing time that
// survives a reload is the one kind of wrong this must not be.

const TTL_MS = 10 * 60_000;

interface Cached { at: number; rows: FlightStatus[] | null }
const board = new Map<string, Cached>();
const inflight = new Map<string, Promise<FlightStatus[] | null>>();

export function clearFlightCache(): void {
  board.clear();
  inflight.clear();
}

async function boardFor(day: string, now = Date.now()): Promise<FlightStatus[] | null> {
  const hit = board.get(day);
  if (hit && now - hit.at < TTL_MS) return hit.rows;

  // Six ride cards mounting together must not become six calls. The
  // second through sixth wait on the first.
  const already = inflight.get(day);
  if (already) return already;

  const run = (async () => {
    try {
      const rows = await provider.arrivals(day);
      board.set(day, { at: now, rows });
      return rows;
    } catch {
      // A thrown provider is a provider that could not answer, which is
      // the same as a null one. It is not an error anybody can act on.
      board.set(day, { at: now, rows: null });
      return null;
    } finally {
      inflight.delete(day);
    }
  })();

  inflight.set(day, run);
  return run;
}

/**
 * This flight, on this Aruba day, if the board knows it.
 *
 * Matches on the canonical number and on every codeshare the provider
 * listed, because the number on the guest's ticket and the number the
 * aircraft files under are routinely different.
 */
export async function arrivalFor(
  flightNumber: string | null | undefined,
  day: string,
  now = Date.now(),
): Promise<FlightStatus | null> {
  if (!flightNumber) return null;
  const want = formatFlightNumber(flightNumber);
  if (!want) return null;

  const rows = await boardFor(day, now);
  if (!rows) return null;

  return rows.find((r) =>
    r.flight === want || r.alsoKnownAs.some((n) => n === want),
  ) ?? null;
}

// ── reading one ──────────────────────────────────────────────────────

/** The time to plan around: what we now believe, else the timetable. */
export function expectedAt(f: FlightStatus): string | null {
  return f.actual ?? f.estimated ?? f.scheduled;
}

/**
 * How far off the timetable, in minutes. Positive is late.
 *
 * Null when there is nothing to compare — which is different from zero,
 * and a screen that renders null as "on time" is claiming knowledge it
 * does not have.
 */
export function driftMinutes(f: FlightStatus): number | null {
  const now = f.actual ?? f.estimated;
  if (!now || !f.scheduled) return null;
  const a = Date.parse(now);
  const b = Date.parse(f.scheduled);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 60_000);
}

/**
 * Whether this is worth putting in front of a driver.
 *
 * A flight running four minutes late is noise: the driver is already on
 * their way and nothing about their morning changes. Fifteen minutes is
 * where it starts costing somebody a wait at the kerb.
 */
export const WORTH_SAYING_MINUTES = 15;

export function worthSaying(f: FlightStatus): boolean {
  if (f.state === "cancelled" || f.state === "diverted") return true;
  const d = driftMinutes(f);
  return d != null && Math.abs(d) >= WORTH_SAYING_MINUTES;
}
