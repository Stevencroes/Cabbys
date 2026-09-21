// ── The flight, on the ride an operator is about to act on ────────────
//
// The third and last screen this fact appears on, and the only one where
// the reader is not travelling. The driver's FlightLine answers "do I
// set off yet". The guest's TripFlight answers "does the car still
// know". This answers neither: an operator arriving here has already
// been told, by the attention list, that something is wrong and what to
// do about it. What they need before taking a driver off a ride is to
// SEE the thing the list claimed.
//
// So this states the fact and gives no advice. flightSay's head is the
// shared, audience-independent half — "Flight cancelled", "Now lands
// 7:20 PM", "Landed 5:47 PM" — and it is read from the same function
// both portals read, so the board can never say something the driver's
// screen contradicts. The detail is left off on purpose: both existing
// audiences address the reader as somebody heading to the airport
// ("don't drive to this without checking with Cabby's"), and an operator
// reading that about their own company is a sentence written for
// somebody else.
//
// The timetable time is printed underneath, always, because it is the
// one number nobody can revise and it is what the booking was planned
// against.
//
// Renders nothing when nothing is known, which is most rides on most
// boards: not an airport arrival, no number typed, no row yet, no key
// set. The Flight fact then shows what the guest typed and nothing else,
// exactly as it did before this existed.
import { jobTime } from "../driver/JobCard";
import { flightSay } from "../lib/flightSay";
import { useFlight } from "../lib/useFlight";
import { pinPolicyFor } from "../lib/pickupPin";
import type { AdminRide } from "./lib/admin";

export default function RideFlight({ ride }: { ride: AdminRide }) {
  // Arrivals only. On a run TO the airport the number is a DEPARTURE,
  // and looking it up as an arrival returns either nothing or, worse,
  // that morning's inbound leg — a landing time for a plane this guest
  // is not on. The gate is on what the hook is HANDED rather than on
  // whether it runs, because a hook behind an if is not a hook.
  const airport = pinPolicyFor(ride.pickup) === "airport";
  const flight = useFlight(
    airport ? ride.flightNumber : null,
    airport ? ride.scheduledAt : null,
  );
  const say = flightSay(flight, jobTime);
  if (!flight || !say) return null;

  return (
    <span className={`adm-flight ${say.tone}`}>
      {/* The state is a WORD first. The tint is the second signal and
          never the only one — the same rule the attention list is built
          on, for the same operator who cannot separate the clay from
          the teal at five in the morning. */}
      <span className="fv">{say.head}</span>
      {flight.scheduled && <span className="q">Scheduled {jobTime(flight.scheduled)}</span>}
    </span>
  );
}
