// ── The flight, on the guest's trip card ──────────────────────────────
//
// The counterpart to the driver's FlightLine, and deliberately not a
// copy of it. Same row, same hook, same thresholds — a different job.
//
// The driver's line answers "do I set off yet". The guest's answers a
// question they have not asked out loud: the flight is delayed, they
// found out at the gate an hour ago, and the thought forming is "does
// the car still know?". That phone call is the cost this whole feature
// exists to remove, and it is not removed by telling a guest something
// they already know — only by showing that Cabby's is looking at the
// same screen they are. flightSay's "guest" audience carries that;
// everything about WHEN to say it lives here and in flightStatus.ts,
// shared with the driver so the two can never drift apart.
//
// Renders nothing when nothing is known, which is the ordinary case and
// will stay it: no key, nobody has asked yet, a mistyped number, a
// flight that does not operate, the month's budget spent. The card then
// looks exactly as it did before this existed — the guest's own typed
// "Flight KL765" in .tp-meta, and no empty box where an answer would go.
import { flightSay } from "../lib/flightSay";
import { useFlight } from "../lib/useFlight";
import { pickupInstant, pinPolicyFor } from "../lib/pickupPin";
import { ARUBA_OFFSET_MINUTES, formatTime } from "../lib/datetime";

export interface FlightRide {
  pickup_location: string;
  flight_number?: string | null;
  /** Both shapes, because rides carry the time in both — see pickupInstant. */
  scheduled_at?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
}

/**
 * An instant → the clock on the wall in Aruba. The guest's own, because
 * flightSay is handed a formatter rather than owning one, and the driver
 * portal's jobTime() is not something a public page should be importing.
 */
function arubaClock(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return formatTime(new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16));
}

export default function TripFlight({ ride }: { ride: FlightRide }) {
  // Only a pickup AT the airport. On a run TO the airport the number is
  // a DEPARTURE, and arrivalFor() would look it up as an arrival — so
  // the best case is a null and the worst is yesterday's inbound leg
  // reported as "Lands 5:55 PM" to somebody who is not on it.
  const meeting = pinPolicyFor(ride.pickup_location) === "airport";

  // The hook runs either way — a gate above it would be a conditional
  // hook — so the gate is on what it is handed. Null keeps a departure
  // out of the lookup and, since flight data is billed by the call, out
  // of the meter as well.
  //
  // pickupInstant, NOT ride.scheduled_at. The booking flow writes
  // scheduled_date + scheduled_time and leaves scheduled_at null on
  // every row a guest has ever made; reading scheduled_at here would
  // hand useFlight a null day, and the line would never appear for
  // anybody. That is not hypothetical — it is precisely how the pin
  // button shipped broken, and the unit tests missed it by passing a
  // scheduled_at, which is a shape the product does not produce.
  const flight = useFlight(
    meeting ? ride.flight_number ?? null : null,
    meeting ? pickupInstant(ride) : null,
  );
  const say = flightSay(flight, arubaClock, "guest");
  if (!flight || !say) return null;

  return (
    // Only cancelled and diverted announce themselves. A guest may have
    // this page open on the plane's wifi; a screen reader interrupting
    // them because the landing time shifted twenty minutes is the
    // audible version of the red banner this design refuses to draw.
    <div className={`tp-flight ${say.tone}`} role={say.tone === "alert" ? "alert" : undefined}>
      {/* No flight number here. The driver's line prints one because they
          are matching it against the arrivals board; the guest is holding
          the boarding pass it came off. The card's .tp-meta keeps their
          own typed "Flight KL765" — which stays put precisely because it
          is the only thing that shows a typo, and a typo is the single
          most likely reason this box is absent. */}
      <div className="tf-v">{say.head}</div>
      {say.detail && <div className="tf-d">{say.detail}</div>}
    </div>
  );
}
