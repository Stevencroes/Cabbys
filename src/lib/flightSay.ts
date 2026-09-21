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

/**
 * Who is reading. Same facts, same clocks, same threshold — different job.
 *
 * The DRIVER is deciding whether to set off, so the line is quiet until
 * something would change that decision.
 *
 * The GUEST is sitting at the gate and ALREADY KNOWS the flight is late;
 * the airline told them an hour ago. Repeating it is worth nothing. What
 * is worth something is that Cabby's can see it too — that is the whole
 * reason this line is on their card, and it is the call it exists to
 * prevent ("does the car still know?"). So the guest's line says a
 * sentence in states where the driver's says nothing, and the sentence
 * is always about us, never about their flight.
 *
 * A parameter rather than a second module: the thresholds and the order
 * the four clocks outrank each other are the part that must never drift
 * between the two portals, and a copy is a copy that eventually does.
 */
export type Audience = "driver" | "guest";

/**
 * The one thing the guest's line is for, and it is a claim we can keep:
 * the driver's own screen renders this same line off this same row.
 *
 * Deliberately NOT "your pickup moves with your flight" — nothing here
 * rewrites the ride's time, and a promise the database has not made is
 * the kind that gets discovered at a kerb.
 */
const WATCHING = "Your driver is watching this flight too.";

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
  audience: Audience = "driver",
): FlightSay | null {
  if (!f) return null;
  const guest = audience === "guest";

  if (f.state === "cancelled") {
    return {
      tone: "alert",
      head: "Flight cancelled",
      // The guest's half names the flight on purpose: this is the one
      // moment it is worth them checking they typed their own number.
      detail: guest
        ? `We can see ${f.flight} isn't operating. Message us and we'll sort your pickup out.`
        : `${f.flight} isn't operating. Don't drive to this without checking with Cabby's.`,
    };
  }

  if (f.state === "diverted") {
    return {
      tone: "alert",
      head: "Flight diverted",
      detail: guest
        ? `We can see ${f.flight} isn't landing in Aruba. Message us and we'll sort your pickup out.`
        : `${f.flight} isn't landing in Aruba. Check with Cabby's before you go.`,
    };
  }

  if (f.actual) {
    const late = driftMinutes(f);
    return {
      tone: "quiet",
      head: `Landed ${fmt(f.actual)}`,
      // "22 min late" is a driver's number — it is the size of the wait
      // they just avoided. The guest was on the plane and counted it
      // themselves, so theirs gets the reassurance instead.
      detail: guest
        ? WATCHING
        : late != null && Math.abs(late) >= WORTH_SAYING_MINUTES
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
      // Both portals raise their voice here, for opposite reasons: the
      // driver's because the decision changed, the guest's because the
      // TIME ON THE CARD changed and a number that moves silently is a
      // number nobody trusts. Naming the airline is the driver's answer
      // to "who says so"; the guest already heard it from them.
      detail: f.scheduled
        ? guest
          ? `Scheduled ${fmt(f.scheduled)} — we've got the new time, and so has your driver.`
          : `Scheduled ${fmt(f.scheduled)} — the airline moved it`
        : guest
          ? "We've got the new time, and so has your driver."
          : "Moved by the airline",
    };
  }

  // Only the model has spoken. The headline stays the promised time; the
  // model gets a sentence with its own name on it, and the advice
  // depends on which way it points — see the rule at the top.
  if (predictedOnly(f) && worth && f.predicted && f.scheduled) {
    const early = (drift ?? 0) < 0;
    return {
      // The one place the two tones part. A driver may leave early on a
      // model, so it earns colour on their screen. On the guest's card
      // the HEADLINE HAS NOT MOVED — it is still the time they were
      // given — and tinting the box under an unchanged time says
      // something changed when nothing has. The guest's tint follows the
      // headline; the driver's follows the decision.
      tone: guest ? "quiet" : "warn",
      head: `Lands ${fmt(f.scheduled)}`,
      detail: early
        ? guest
          ? `Tracking expects ${fmt(f.predicted)} — we're planning for the earlier one.`
          : `Tracking expects ${fmt(f.predicted)} — plan for the earlier one.`
        : guest
          ? `Tracking expects ${fmt(f.predicted)} — the airline hasn't confirmed it. We're watching.`
          : `Tracking expects ${fmt(f.predicted)} — not confirmed, so don't count on the extra time.`,
    };
  }

  const at = expectedAt(f);
  if (!at) return null;

  // On time, or moved by less than anyone would act on. One quiet line,
  // which is worth saying only because it shows Cabby's is watching.
  //
  // And that is exactly why the guest gets a second line here where the
  // driver gets none: "Cabby's is watching" is a by-product for the
  // driver and the entire point for the guest. Note what it still does
  // NOT do — a drift under WORTH_SAYING_MINUTES goes unmentioned to both
  // of them. Eight minutes is invisible from a departure gate too, and
  // putting it on a trip card manufactures a worry out of nothing.
  return { tone: "quiet", head: `Lands ${fmt(at)}`, detail: guest ? WATCHING : null };
}
