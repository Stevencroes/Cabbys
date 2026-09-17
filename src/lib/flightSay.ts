// ── What to actually say about a flight ───────────────────────────────
//
// One place, both portals, because the driver and the guest are looking
// at the same fact from opposite sides and two copies would eventually
// disagree about it.
//
// ── The rule this is built on ─────────────────────────────────────────
//
// A driver arriving early waits. A guest arriving to no car waits, in an
// arrivals hall, in a country they landed in twenty minutes ago. Those
// are not the same cost, so the two directions are not treated the same:
//
//   An EARLY signal is acted on — plan for the earlier time.
//   A LATE signal is noted but not leaned on, unless the airline said
//   it, because an unconfirmed delay that turns out to be wrong puts a
//   driver at the kerb after the guest.
//
// ── Who said it ───────────────────────────────────────────────────────
//
// The live call that started this had KLM's schedule unchanged at 17:55
// and AeroDataBox's own model predicting 17:40. Fifteen minutes, from a
// model, with no airline behind it. Showing that as "lands 17:40" would
// be inventing a fact; hiding it would throw away a real signal. So the
// time stays the one somebody promised, and the model gets its own
// sentence with its name on it.
import { driftMinutes, expectedAt, predictedOnly, WORTH_SAYING_MINUTES, type FlightStatus } from "./flightStatus";

export type Tone = "quiet" | "warn" | "alert";

export interface FlightSay {
  tone: Tone;
  /** the headline, always a time somebody is accountable for */
  head: string;
  /** the hedge, the source, or the instruction — null when there's none */
  detail: string | null;
}

/** fmt turns an ISO instant into Aruba clock time — each portal has its
    own, and neither should grow a second copy of the arithmetic. */
export function flightSay(
  f: FlightStatus | null,
  fmt: (iso: string) => string,
): FlightSay | null {
  if (!f) return null;

  if (f.state === "cancelled") {
    return {
      tone: "alert",
      head: "Flight cancelled",
      detail: `${f.flight} isn't operating. Don't drive to this without checking with Cabby's.`,
    };
  }

  if (f.state === "diverted") {
    return {
      tone: "alert",
      head: "Flight diverted",
      detail: `${f.flight} isn't landing in Aruba. Check with Cabby's before you go.`,
    };
  }

  if (f.actual) {
    const late = driftMinutes(f);
    return {
      tone: "quiet",
      head: `Landed ${fmt(f.actual)}`,
      detail: late != null && Math.abs(late) >= WORTH_SAYING_MINUTES
        ? `${Math.abs(late)} min ${late > 0 ? "late" : "early"}`
        : null,
    };
  }

  const drift = driftMinutes(f);
  const worth = drift != null && Math.abs(drift) >= WORTH_SAYING_MINUTES;

  // The airline moved it. That is a fact, so it becomes the headline and
  // the old time is the footnote.
  if (f.estimated && worth) {
    return {
      tone: "warn",
      head: `Now lands ${fmt(f.estimated)}`,
      detail: f.scheduled
        ? `Scheduled ${fmt(f.scheduled)} — the airline moved it`
        : "Moved by the airline",
    };
  }

  // Only the model has spoken. The headline stays the promised time; the
  // model gets a sentence with its own name on it, and the advice
  // depends on which way it points — see the rule at the top.
  if (predictedOnly(f) && worth && f.predicted && f.scheduled) {
    const early = (drift ?? 0) < 0;
    return {
      tone: "warn",
      head: `Lands ${fmt(f.scheduled)}`,
      detail: early
        ? `Tracking expects ${fmt(f.predicted)} — plan for the earlier one.`
        : `Tracking expects ${fmt(f.predicted)} — not confirmed, so don't count on the extra time.`,
    };
  }

  const at = expectedAt(f);
  if (!at) return null;

  // On time, or moved by less than anyone would act on. One quiet line,
  // which is worth saying only because it shows Cabby's is watching.
  return { tone: "quiet", head: `Lands ${fmt(at)}`, detail: null };
}
