// ── The flight, on the driver's ride screen ───────────────────────────
//
// What this replaces: "Flight lands 1:45 PM AST", sitting under "What
// the guest told us" — a sentence somebody typed at booking, weeks ago,
// which has been true or false ever since with no way to tell which.
//
// Quiet by construction. A driver reads this screen at 5am with one
// hand; a box that changes colour for a four-minute drift is a box they
// stop reading, and then it is worth nothing on the day it matters.
// Only two states are allowed to be loud, and both of them mean the
// same thing: do not drive yet.
//
// Renders nothing at all when nobody knows anything, which is the
// ordinary case and will stay the ordinary case — no key, nobody has
// asked yet, a mistyped number, a flight that does not operate. The
// guest's own line stands, exactly as it does today.
import { flightSay } from "../lib/flightSay";
import { useFlight } from "../lib/useFlight";
import { jobTime } from "./JobCard";

export default function FlightLine({
  flightNumber,
  scheduledAt,
}: {
  flightNumber: string | null;
  scheduledAt: string | null;
}) {
  const flight = useFlight(flightNumber, scheduledAt);
  const say = flightSay(flight, (iso) => jobTime(iso));
  if (!flight || !say) return null;

  return (
    <div className={`drv-flight ${say.tone}`} role={say.tone === "alert" ? "alert" : undefined}>
      <div className="fk">
        {/* The number is the thing a driver checks against the board in
            arrivals, so it keeps its own line rather than being folded
            into a sentence. */}
        <span className="fn">{flight.flight}</span>
        {flight.airline && <span className="fa">{flight.airline}</span>}
      </div>
      <div className="fv">{say.head}</div>
      {say.detail && <div className="fd">{say.detail}</div>}
    </div>
  );
}
