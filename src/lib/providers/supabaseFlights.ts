// ── Where the browser gets its flight answers ─────────────────────────
//
// From Supabase, never from AeroDataBox. The scheduled function asked
// once and wrote the vendor's own answer into public.flight_status; this
// reads it, and a read costs nothing. Five drivers with the app open are
// five free reads of one paid-for answer.
//
// The parsing happens HERE rather than in the function that fetched it,
// on purpose — readArrival is tested against a real response and carries
// three fixes that were found in one. Keeping the raw JSON in the table
// means those fixes apply to rows already stored, instead of costing
// units to fetch again.
import { supabase } from "../supabase";
import { flightKey, type FlightKey, type FlightProvider, type FlightStatus } from "../flightStatus";
import { formatFlightNumber } from "../flight";
import { readArrival } from "./aerodatabox";

export const supabaseFlights: FlightProvider = {
  name: "supabase",
  enabled: true,

  async lookup(flight: string, day: string): Promise<FlightStatus | null> {
    const { data, error } = await supabase
      .from("flight_status")
      .select("raw, ok")
      .eq("flight", flight)
      .eq("day", day)
      .maybeSingle();

    // Thrown rather than swallowed, so flightStatus.ts caches it as a
    // miss and stops re-asking. A missing table — the state before
    // docs/flight-schema.sql is run — lands here, and the screens carry
    // on showing what the guest typed, which is what they show today.
    if (error) throw new Error(error.message);

    // No row: nobody has asked yet. The scheduler gets to it as the
    // pickup approaches, and until then there is nothing to say.
    if (!data) return null;

    // ok=false is "we could not ask"; raw=null with ok=true is "asked,
    // no such flight". Both leave the screen with the guest's own words,
    // but only the second is a fact about the world.
    if (!data.ok || !data.raw) return null;

    return readArrival(data.raw);
  },

  /**
   * The dispatch board's whole morning, in one round trip.
   *
   * Two `.in()` filters rather than one `or()` of (flight,day) pairs,
   * and that is the deliberate part: PostgREST puts the filter in the
   * QUERY STRING, and thirty pairs spelt out as an or() is a URL long
   * enough to be refused by a proxy nobody controls — a board that works
   * on a quiet day and 414s on a busy one, which is the worst possible
   * failure shape for this screen. Two `.in()` lists ask a slightly
   * wider question (every wanted flight × every wanted day) and the
   * extra rows are dropped here. The board looks at one or two days at a
   * time, so "wider" is a handful of rows, and the read is free.
   */
  async lookupMany(keys: FlightKey[]): Promise<Map<string, FlightStatus | null>> {
    const out = new Map<string, FlightStatus | null>();
    if (!keys.length) return out;

    const wanted = new Set(keys.map((k) => flightKey(k.flight, k.day)));
    const flights = [...new Set(keys.map((k) => formatFlightNumber(k.flight)))];
    const days = [...new Set(keys.map((k) => k.day))];

    const { data, error } = await supabase
      .from("flight_status")
      .select("flight, day, raw, ok")
      .in("flight", flights)
      .in("day", days);

    // Thrown, not swallowed — same reason as lookup(). A missing table
    // is the state before docs/flight-schema.sql has been run, and
    // reporting it as "no flight is late" would be the house fault of
    // answering an unreadable table with an empty one.
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) return out;

    for (const r of data as { flight?: string; day?: string; raw?: unknown; ok?: boolean }[]) {
      const key = flightKey(String(r.flight ?? ""), String(r.day ?? ""));
      // A pair the cross product threw in that nobody asked about.
      if (!wanted.has(key)) continue;
      // Same two nothings as lookup(): ok=false is "we could not ask",
      // raw=null is "asked, no such flight". Both are null to a screen.
      out.set(key, r.ok && r.raw ? readArrival(r.raw) : null);
    }
    return out;
  },
};
