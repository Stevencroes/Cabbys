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
import type { FlightProvider, FlightStatus } from "../flightStatus";
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
};
