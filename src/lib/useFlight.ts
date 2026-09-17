// ── What Cabby's knows about a ride's flight ──────────────────────────
//
// One hook, both portals. The driver and the guest are looking at the
// same fact from opposite sides, and it would be two chances to disagree
// about it.
//
// Reads through flightStatus.ts, which reads our own table, which the
// scheduled function fills. Nothing here calls a vendor and nothing here
// costs anything: four screens open on the same ride is four reads of
// one paid-for answer.
//
// Returns null for every kind of not-knowing there is — no key, nobody
// has asked yet, no such flight, a mistyped number, the table isn't
// there. That is deliberate. A screen that has to tell those apart is a
// screen showing a driver something that isn't about their morning; the
// only useful distinction is between knowing and not, and not-knowing
// means the guest's own typed line stands, exactly as it does today.
import { useEffect, useState } from "react";
import { arrivalFor, type FlightStatus } from "./flightStatus";
import { arubaDayOf } from "./datetime";
import { isValidFlightNumber } from "./flight";

export function useFlight(
  flightNumber: string | null | undefined,
  scheduledAt: string | null | undefined,
): FlightStatus | null {
  const [f, setF] = useState<FlightStatus | null>(null);
  const day = arubaDayOf(scheduledAt);

  useEffect(() => {
    // Nothing to ask about. Checking the shape first keeps a guest's
    // "I'll text you my flight" out of the lookup and out of the meter.
    if (!flightNumber || !day || !isValidFlightNumber(flightNumber)) {
      setF(null);
      return;
    }
    let live = true;
    void arrivalFor(flightNumber, day).then((row) => { if (live) setF(row); });
    return () => { live = false; };
  }, [flightNumber, day]);

  return f;
}
