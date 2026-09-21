// ── Flight status: when the plane actually lands ──────────────────────
//
// Today a ride carries the flight number the guest typed and nothing
// else, so "Flight lands 1:45 PM AST" on the driver's screen is a
// sentence a guest wrote weeks ago. This turns it into something Cabby's
// knows — and, when it doesn't know, leaves exactly the sentence that is
// there now rather than replacing it with a worse guess.
//
// ── Why this asks about a FLIGHT and not the whole BOARD ─────────────
//
// It asked for the board first, and that was wrong for this business.
// The board looks cheaper — one call covers every ride landing that
// afternoon — but it is billed by the CLOCK, not by the ride: polling
// AUA every twenty minutes through the pickup hours costs the same
// whether six guests land or none, and lands around 360 calls a month
// before a single transfer has been carried.
//
// The real plan turned out to be 400 units a month. Asking about the
// flights we actually carry — four checks as each one approaches — is a
// few dozen. The board becomes the better buy again at volume, and that
// is a plan upgrade rather than a rewrite, because of the seam below.
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
  // Four clocks, kept apart on purpose. Flattening them into one "time"
  // throws away who said it, and who said it is the whole question when
  // a driver is deciding whether to leave now.
  /** the timetable — the only time anyone ever promised */
  scheduled: string | null;
  /** an airline or airport saying otherwise. Null when nobody has. */
  estimated: string | null;
  /** the VENDOR'S MODEL, not the airline. Never shown as a fact. */
  predicted: string | null;
  /** on the ground. Nothing outranks this. */
  actual: string | null;
  state: FlightState;
  terminal: string | null;
  aircraft: string | null;
  airline: string | null;
  /** whether the vendor has live tracking on this one, or only a timetable */
  live: boolean;
}

export type FlightState =
  | "scheduled" | "delayed" | "early" | "landed" | "cancelled" | "diverted" | "unknown";

/** One question: this flight, on this Aruba calendar day. */
export interface FlightKey {
  flight: string;
  day: string;
}

/**
 * The one spelling of a cache key, so the two ways in agree.
 *
 * arrivalFor() and arrivalsFor() index the same map, and a provider
 * answering in bulk has to name its rows the same way or every answer it
 * gives is filed under a key nobody looks up. Normalising the number
 * here rather than at each call site is the same fix formatFlightNumber
 * already carries: "KL0765" and "KL765" are one flight, and two keys for
 * one flight is a cache that never hits and a budget spent twice.
 */
export function flightKey(flight: string, day: string): string {
  return `${formatFlightNumber(flight)}|${day}`;
}

export interface FlightProvider {
  name: string;
  enabled: boolean;
  /** This flight, landing at AUA on this Aruba calendar day. Null covers
      both "no such flight" and "could not ask" — the screen does the
      same thing either way, which is to keep the guest's own words. */
  lookup(flight: string, day: string): Promise<FlightStatus | null>;
  /**
   * The same question about many flights, in one round trip. Optional:
   * a provider without one is asked flight by flight instead, which is
   * correct and merely slower.
   *
   * Keyed by flightKey(). A key the provider leaves out of the map means
   * exactly what a null lookup() means — nobody can say — so a partial
   * answer is a legal answer and not an error.
   */
  lookupMany?(keys: FlightKey[]): Promise<Map<string, FlightStatus | null>>;
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
  lookup: async () => null,
};

let provider: FlightProvider = NO_PROVIDER;

/** Swap the vendor in. Called once at startup, and by tests. */
export function useFlightProvider(p: FlightProvider): void {
  provider = p;
  seen.clear();
  inflight.clear();
}

export function flightTrackingEnabled(): boolean {
  return provider.enabled;
}

// ── the cache ────────────────────────────────────────────────────────
// Per flight, per Aruba day. Short enough that a delay announced ten
// minutes ago shows up, long enough that four screens open on the same
// ride cost one unit between them. Deliberately NOT localStorage: a
// stale landing time that survives a reload is the one kind of wrong
// this must not be.
//
// On a 400-unit month the cache is not a nicety, it is the budget.

const TTL_MS = 10 * 60_000;

interface Cached { at: number; row: FlightStatus | null }
const seen = new Map<string, Cached>();
const inflight = new Map<string, Promise<FlightStatus | null>>();

export function clearFlightCache(): void {
  seen.clear();
  inflight.clear();
}

/** How many units this process has spent. For the budget guard and for
    anyone wondering where the month went. */
let spent = 0;
export function unitsSpent(): number { return spent; }
export function resetUnitsSpent(): void { spent = 0; }

/**
 * This flight, on this Aruba day, if anyone can say.
 *
 * Null covers every miss there is — no provider, no such flight, dead
 * network, a provider that threw — because every one of them means the
 * same thing to a screen: say what the guest told us and nothing more.
 */
export async function arrivalFor(
  flightNumber: string | null | undefined,
  day: string,
  now = Date.now(),
): Promise<FlightStatus | null> {
  if (!flightNumber) return null;
  const want = formatFlightNumber(flightNumber);
  if (!want) return null;

  const key = flightKey(want, day);
  const hit = seen.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.row;

  // Four cards mounting together must not become four units.
  const already = inflight.get(key);
  if (already) return already;

  const run = (async () => {
    try {
      spent++;
      const row = await provider.lookup(want, day);
      seen.set(key, { at: now, row });
      return row;
    } catch {
      // A provider that threw is a provider that could not answer. It is
      // cached as a miss so a dead vendor cannot be retried into the
      // ground by a screen that re-renders.
      seen.set(key, { at: now, row: null });
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, run);
  return run;
}

/**
 * Everything a whole SCREEN needs to know, in one round trip.
 *
 * Written for the dispatch board, which is the first caller that asks
 * about many flights at once: an operator's morning is thirty rides, and
 * thirty of these questions fired one per row — re-fired every time the
 * board re-renders — is the shape of request storm this cache was built
 * to prevent in the first place.
 *
 * It does NOT go around the cache; it goes through it. Every key is
 * checked against `seen` first, every key already being fetched joins
 * that promise rather than starting a second one, and every key this
 * call does fetch is registered in `inflight` BEFORE the await — so a
 * card mounting mid-flight (a ride view opening while the board loads)
 * joins this read instead of paying for its own. What comes back is
 * filed in `seen` exactly as a single lookup would file it, which is why
 * the two can be mixed freely.
 *
 * Returns only what is known. A key with no answer is simply absent,
 * because "no row yet", "no such flight" and "no key set" are one state
 * to every caller — say nothing — and a map full of nulls invites a
 * screen to draw a box for each of them.
 */
export async function arrivalsFor(
  keys: FlightKey[],
  now = Date.now(),
): Promise<Map<string, FlightStatus>> {
  const out = new Map<string, FlightStatus>();
  const joins: Promise<unknown>[] = [];
  const ask = new Map<string, FlightKey>();
  const handled = new Set<string>();

  for (const k of keys) {
    const want = formatFlightNumber(k.flight ?? "");
    if (!want || !k.day) continue;
    const key = flightKey(want, k.day);
    // Two rides off the same flight are one question. This is the
    // ordinary case on an island where a single KLM arrival fills three
    // cars, not an edge one.
    if (handled.has(key)) continue;
    handled.add(key);

    const hit = seen.get(key);
    if (hit && now - hit.at < TTL_MS) {
      if (hit.row) out.set(key, hit.row);
      continue;
    }
    const already = inflight.get(key);
    if (already) {
      joins.push(already.then((row) => { if (row) out.set(key, row); }));
      continue;
    }
    ask.set(key, { flight: want, day: k.day });
  }

  if (ask.size) {
    if (provider.lookupMany) {
      // One call, one unit. `spent` counts what the vendor bills, and a
      // vendor that answers thirty flights in one request billed once —
      // counting it thirty times would make the budget guard refuse a
      // month that had not been spent.
      spent++;
      const run = provider.lookupMany([...ask.values()]);
      for (const key of ask.keys()) {
        // A provider that threw could not answer, which is the same
        // nothing as a flight it has never heard of — and it is cached
        // as a miss for the same reason arrivalFor caches one, so a dead
        // vendor cannot be retried into the ground by a board that
        // re-renders.
        const per = run
          .then((m) => m.get(key) ?? null, () => null)
          .then((row) => {
            seen.set(key, { at: now, row });
            inflight.delete(key);
            return row;
          });
        inflight.set(key, per);
        joins.push(per.then((row) => { if (row) out.set(key, row); }));
      }
    } else {
      // No bulk path on this vendor. One at a time is the honest
      // fallback, and arrivalFor already carries the cache, the dedupe
      // and the failure handling — there is nothing to reimplement here.
      for (const [key, k] of ask) {
        joins.push(arrivalFor(k.flight, k.day, now).then((row) => { if (row) out.set(key, row); }));
      }
    }
  }

  await Promise.all(joins);
  return out;
}

// ── reading one ──────────────────────────────────────────────────────

/**
 * The time to plan around, in order of who said it.
 *
 * On the ground beats an airline's revision, which beats a model's
 * guess, which beats a timetable printed months ago. The prediction is
 * in here because ignoring a credible fifteen minutes would send a car
 * late — but see predictedOnly(), which is how a screen knows to hedge.
 */
export function expectedAt(f: FlightStatus): string | null {
  return f.actual ?? f.estimated ?? f.predicted ?? f.scheduled;
}

/**
 * True when the only thing moving this flight is the vendor's model.
 *
 * A screen showing 17:40 has to say whether an airline said so or a
 * statistical model did, because a driver acts differently on each. This
 * is the flag that forces the caller to decide rather than letting the
 * two look identical.
 */
export function predictedOnly(f: FlightStatus): boolean {
  return !f.actual && !f.estimated && f.predicted != null;
}

/**
 * How far off the timetable, in minutes. Positive is late.
 *
 * Null when there is nothing to compare — which is different from zero,
 * and a screen that renders null as "on time" is claiming knowledge it
 * does not have.
 */
export function driftMinutes(f: FlightStatus): number | null {
  const now = f.actual ?? f.estimated ?? f.predicted;
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
