// ── AeroDataBox → FlightStatus ────────────────────────────────────────
//
// The one file that knows which vendor answered. Everything above it
// asks flightStatus.ts and gets a FlightStatus or null.
//
// Written to run SERVER-SIDE — it takes the key as an argument and never
// reads import.meta.env. A VITE_ variable is compiled into the bundle
// every visitor downloads, and this key is neither domain-locked like
// the Maps key nor publishable by design like Stripe's. In the browser
// it would be lifted and a 400-call month spent by a stranger.
//
// ── Three things the real response taught us ──────────────────────────
//
// These are not hypotheticals. They come from the first live call this
// project ever made, to KL765 on 17 September 2026, and each one is a
// WRONG ANSWER rather than an error — which is the kind that ships.
//
// 1. ONE FLIGHT NUMBER IS A ROTATION, NOT A FLIGHT. KL765 came back as
//    three legs: Amsterdam→Aruba, Aruba→Bonaire, Bonaire→Amsterdam.
//    Aruba appears TWICE, once as an arrival and once as a departure.
//    Taking the first leg, or the first leg that mentions Aruba, picks
//    the 19:15 departure for a guest whose plane lands at 17:55 — a
//    driver told to collect eighty minutes late, with no error anywhere.
//    So the leg is chosen by where it ARRIVES, and nothing else.
//
// 2. THE TIMESTAMPS ARE NOT VALID DATES. AeroDataBox sends
//    "2026-09-17 21:55Z" — a space where ISO 8601 requires a T. V8
//    forgives it, so it parses in Chrome and in every test runner;
//    Safari returns Invalid Date. The driver portal is used on iPhones.
//    This is the exact bug that goes green all the way to the kerb.
//
// 3. THE NUMBER COMES BACK SPACED. The guest typed KL0765, the response
//    says "KL 765". See formatFlightNumber — both collapse to KL765.
import { formatFlightNumber } from "../flight";
import type { FlightState, FlightStatus } from "../flightStatus";

/** Queen Beatrix International, as AeroDataBox names it. */
export const AUA_ICAO = "TNCA";

/**
 * AeroDataBox's near-ISO into a real instant.
 *
 * "2026-09-17 21:55Z" → "2026-09-17T21:55Z". Returns null rather than an
 * Invalid Date, so a caller cannot accidentally render NaN as a time.
 */
export function parseAeroTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iso = raw.trim().replace(" ", "T");
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Their status vocabulary, mapped onto ours.
 *
 * Anything unrecognised becomes "unknown" rather than being passed
 * through: a status this app has never seen must not reach a screen that
 * will style it as though it had.
 */
export function mapState(raw: string | null | undefined): FlightState {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "expected":
    case "scheduled":
    case "checkin":
    case "boarding":
    case "gateclosed":
    case "departed":
    case "enroute":
    case "approaching":
      return "scheduled";
    case "delayed":       return "delayed";
    case "arrived":
    case "landed":        return "landed";
    case "cancelled":
    case "canceled":      return "cancelled";
    case "diverted":      return "diverted";
    default:              return "unknown";
  }
}

interface AeroTime { utc?: string; local?: string }
interface AeroEnd {
  airport?: { icao?: string; iata?: string };
  scheduledTime?: AeroTime;
  revisedTime?: AeroTime;
  predictedTime?: AeroTime;
  actualTime?: AeroTime;
  runwayTime?: AeroTime;
  terminal?: string;
  quality?: string[];
}
export interface AeroLeg {
  number?: string;
  status?: string;
  codeshareStatus?: string;
  departure?: AeroEnd;
  arrival?: AeroEnd;
  airline?: { name?: string };
  aircraft?: { reg?: string; model?: string };
}

/**
 * The leg of this rotation that LANDS at the airport we care about.
 *
 * See note 1 above. Matching on icao and falling back to iata because
 * one field or the other has been missing on legs before.
 */
export function legArrivingAt(legs: AeroLeg[], icao = AUA_ICAO): AeroLeg | null {
  return legs.find((l) => {
    const a = l.arrival?.airport;
    return a?.icao === icao || (icao === AUA_ICAO && a?.iata === "AUA");
  }) ?? null;
}

/**
 * One leg, as the rest of the app understands a flight.
 *
 * Four clocks arrive and they do not mean the same thing, so they are
 * kept apart rather than flattened into one "time":
 *
 *   scheduled — the timetable, and the only one that was ever promised
 *   revised   — the airline or airport saying otherwise. Authoritative,
 *               but it is sent even when it equals the timetable, so it
 *               being present is not news.
 *   predicted — AERODATABOX'S OWN MODEL, not the airline. On the live
 *               call it said fifteen minutes EARLY against an unchanged
 *               schedule. Worth showing, never worth presenting as fact.
 *   actual    — it is on the ground. Nothing outranks this.
 *
 * estimated therefore carries only what somebody in aviation actually
 * said, and the prediction travels separately so a screen can label it.
 */
export function mapLeg(leg: AeroLeg): FlightStatus | null {
  const a = leg.arrival;
  if (!a) return null;

  const scheduled = parseAeroTime(a.scheduledTime?.utc);
  const revised = parseAeroTime(a.revisedTime?.utc);
  const predicted = parseAeroTime(a.predictedTime?.utc);
  const actual = parseAeroTime(a.actualTime?.utc ?? a.runwayTime?.utc);

  return {
    flight: formatFlightNumber(leg.number ?? ""),
    alsoKnownAs: [],
    scheduled,
    // Only a revision that actually revises something. Echoing the
    // timetable back as an estimate would make every flight look
    // confirmed by a human when none of them has been.
    estimated: revised && revised !== scheduled ? revised : null,
    predicted,
    actual,
    state: mapState(leg.status),
    terminal: a.terminal ?? null,
    aircraft: leg.aircraft?.model ?? null,
    airline: leg.airline?.name ?? null,
    live: (a.quality ?? []).includes("Live"),
  };
}

/** The whole trip: response → the leg that lands here → our shape. */
export function readArrival(body: unknown, icao = AUA_ICAO): FlightStatus | null {
  if (!Array.isArray(body)) return null;
  const leg = legArrivingAt(body as AeroLeg[], icao);
  return leg ? mapLeg(leg) : null;
}

export interface AeroOptions {
  key: string;
  /** injectable so tests never reach the network and never need a key */
  fetchImpl?: typeof fetch;
}

/**
 * One call, one flight, one day. Costs exactly one unit.
 *
 * Per-flight rather than the whole arrivals board, and that is a
 * deliberate reversal: a board is cheaper per RIDE but it is billed by
 * the CLOCK, so polling it through the pickup hours costs the same
 * whether six guests land or none. On a 400-unit month with a handful of
 * airport transfers a day, asking about the flights we actually carry is
 * several times cheaper. The board becomes the better buy again at
 * volume, which is a plan upgrade rather than a rewrite.
 */
export async function lookupFlight(
  flight: string, dayLocal: string, opts: AeroOptions,
): Promise<FlightStatus | null> {
  const go = opts.fetchImpl ?? fetch;
  const num = encodeURIComponent(formatFlightNumber(flight));
  const url = `https://aerodatabox.p.rapidapi.com/flights/Number/${num}/${dayLocal}`
    + "?withAircraftImage=false&withLocation=false";

  const res = await go(url, {
    headers: { "x-rapidapi-key": opts.key, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" },
  });

  // 404 is "no such flight that day", which is an answer and not a
  // fault: a guest mistypes a number, or books a flight that does not
  // operate on their date. Same shape as every other miss — null, and
  // the screen keeps the guest's own typed line.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AeroDataBox ${res.status}`);

  return readArrival(await res.json(), AUA_ICAO);
}
