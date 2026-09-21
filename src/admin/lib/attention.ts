// What needs a human, derived from what the board already knows.
//
// There is no tickets table in this project and this file does not
// pretend there is one. Every item below is computed from rides and
// drivers that are already on screen somewhere else — an unassigned 6am
// airport run, a driver who never set off, two jobs on one driver at the
// same hour, a cancelled booking with money still held against it. That
// is deliberate, and it is the difference between an inbox that is
// always right and one that is only as current as the last person who
// remembered to close a ticket.
//
// The cost of deriving rather than storing is that nothing here can be
// DISMISSED: an item goes away when the thing it is about is fixed, and
// not before. That is the right trade for an operations board — an
// alert you can wave away is an alert you will wave away at 5am — but
// it does mean the list has to be ruthless about what earns a place on
// it. Two rules hold it to that:
//
//  · Nothing is listed that the operator cannot act on from this app.
//    "This ride has no flight number" is a fact, not a job.
//  · Nothing is listed twice. A ride that is both unassigned and inside
//    an hour of pickup is one problem with one fix, so it is one item
//    that got more urgent — not two rows competing for the same tap.
//
// The whole file is pure. It takes rides, drivers and a clock and
// returns an array, which is why it can be tested against a fixed
// minute rather than against whatever time the suite happens to run at.
import { CLASH_MINUTES, isClosed, isLive, needsDriver, type AdminRide } from "./admin";
import { identifiable, type DriverProfile } from "../../driver/lib/driver";
import { driftMinutes, expectedAt, type FlightStatus } from "../../lib/flightStatus";

/**
 * How urgent, in the only three grades an operator can act on
 * differently: deal with it now, deal with it today, know about it.
 *
 * Three rather than five because a severity scale nobody can rank in
 * their head is a colour scheme. And it is never carried by colour
 * alone — every item prints its own word, for the operator who cannot
 * tell the teal from the clay and for the one reading in sunlight.
 */
export type Severity = "now" | "soon" | "watch";

export const SEVERITY_LABEL: Record<Severity, string> = {
  now: "Now",
  soon: "Today",
  watch: "Watch",
};

const RANK: Record<Severity, number> = { now: 0, soon: 1, watch: 2 };

export type AttentionKind =
  | "unassigned"
  | "not-under-way"
  | "double-booked"
  | "no-car-shown"
  | "handed-back"
  | "suspended-holding"
  | "money-outstanding"
  | "payment-failed"
  | "no-time"
  | "waiting-approval"
  | "flight-cancelled"
  | "flight-diverted"
  | "flight-late"
  | "flight-early";

export interface AttentionItem {
  /** stable across reloads, so a re-read does not reshuffle the list */
  id: string;
  kind: AttentionKind;
  severity: Severity;
  /** what is wrong, in one line */
  headline: string;
  /** what to do about it, and why it matters if nobody does */
  detail: string;
  /** where the fix is. A ride opens the command view; a driver opens
      their profile. Every item has one or the other — an item with
      nowhere to go is a notification, and this is not a feed. */
  rideId?: string;
  driverId?: string;
  /** the moment this is about, for ordering within a grade */
  at: string | null;
}

/** Inside this many minutes of pickup, an unassigned ride stops being a
    scheduling problem. It is the same ninety minutes the driver portal
    calls "leave now or soon" (IMMINENT_MINUTES) and the same window
    CLASH_MINUTES uses, so the three sides of the app agree about what
    counts as imminent. */
const URGENT_MINUTES = 90;

/** An unassigned ride further out than this is not news — it is the
    pool doing its job. The board's own Requests screen is where those
    are read. */
const HORIZON_HOURS = 24;

/** How late a driver can be off the mark before it is worth saying. A
    pickup time is when the GUEST was told to be ready, and a driver who
    has not tapped "on my way" ten minutes past it may simply not have
    tapped. Past twenty, somebody is standing outside. */
const LATE_MINUTES = 20;

/**
 * ── What a flight has to do before it is the BOARD's problem ─────────
 *
 * A delay is already on two screens before it reaches this one. The
 * driver's ride screen says "Now lands 19:20" from fifteen minutes out
 * (WORTH_SAYING_MINUTES), and the guest's trip card says Cabby's can see
 * it. Repeating that here would be a red badge on a dispatch board: true,
 * and no job attached to it.
 *
 * What makes a delay an operator's job is that somebody has to DECIDE
 * something. Under three quarters of an hour nobody does — the driver
 * waits at the kerb, which is what an airport pickup already is, and the
 * fare does not move. Past it the car is parked for the better part of
 * an hour on a fixed fare, anything else that driver holds today is at
 * risk, and the pickup time on the booking has become a fiction that
 * every other screen is still sorting by.
 *
 * Early is set TIGHTER than late, and deliberately. flightSay says why:
 * a driver arriving early waits in a car, a guest arriving early waits
 * in an arrivals hall in a country they landed in twenty minutes ago.
 * Those are not the same cost, so they do not get the same threshold.
 */
const FLIGHT_LATE_MINUTES = 45;
const FLIGHT_EARLY_MINUTES = 30;

function minutesUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : Math.round((t - now) / 60_000);
}

/** "in 40 min" / "35 min ago" / "" — the same vocabulary the driver
    portal uses for the same fact, kept short enough to sit in a line. */
function when(mins: number | null): string {
  if (mins === null) return "";
  if (mins >= 0) return mins < 60 ? `in ${mins} min` : `in ${Math.round(mins / 60)}h`;
  const late = -mins;
  return late < 60 ? `${late} min ago` : `${Math.round(late / 60)}h ago`;
}

/** "50 min" / "2h 10m" — a LENGTH, not a moment.
    when() says when something happens; this says how far off it is. One
    function doing both ends up writing "in 2h" about a delay, which
    reads as a time of day on a board full of times of day. */
function howLong(mins: number): string {
  const m = Math.abs(Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** How release_ride() and admin_unassign_ride mark the notes column. */
const HANDBACK = "Returned to pool:";

/**
 * Rides whose driver is on another ride at the same time.
 *
 * Keyed by ride id so the schedule can mark both halves of a collision
 * rather than only the later one — an operator reading a day needs to
 * see the pair, not a warning hanging off whichever row sorted second.
 *
 * Not a rule, and never a block: the database will happily put one
 * driver on two runs forty minutes apart and sometimes that is the
 * right call, a short hop either side of the same terminal. What is
 * never right is nobody noticing.
 */
export function collisions(rides: AdminRide[]): Map<string, AdminRide[]> {
  const live = rides.filter((r) => r.driverId && r.scheduledAt && !isClosed(r));
  const out = new Map<string, AdminRide[]>();
  for (const r of live) {
    const t = new Date(r.scheduledAt as string).getTime();
    if (isNaN(t)) continue;
    const others = live.filter((o) => {
      if (o.id === r.id || o.driverId !== r.driverId || !o.scheduledAt) return false;
      const u = new Date(o.scheduledAt).getTime();
      return !isNaN(u) && Math.abs(u - t) < CLASH_MINUTES * 60_000;
    });
    if (others.length) out.set(r.id, others);
  }
  return out;
}

/**
 * Everything that wants a person, worst first.
 *
 * `drivers` may be null — the two tables are read separately and one can
 * fail while the other succeeds. A null means "we could not look", and
 * the three driver-derived items are simply not produced rather than
 * produced empty: telling an operator no driver is suspended, over a
 * drivers table that would not load, is the exact fault this codebase
 * keeps naming.
 *
 * `flights` is ride id → what the flight table says, built by
 * flightWatch.ts from one bulk read. It defaults to empty, and empty
 * means SILENCE — no key set, no row written yet, the month's budget
 * gone, a flight nobody has heard of. All of those are ordinary and all
 * of them produce nothing, exactly as they do on the driver's line and
 * the guest's card. There is no "we could not look" to distinguish here,
 * because flightStatus.ts has already collapsed every kind of
 * not-knowing into one null on purpose: a screen that tells them apart
 * is a screen showing an operator something that is not a job.
 */
export function attentionItems(
  rides: AdminRide[],
  drivers: DriverProfile[] | null,
  now: number = Date.now(),
  flights: Map<string, FlightStatus> = new Map(),
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const clash = collisions(rides);
  const seen = new Set<string>();

  /** One ride, one item. The first thing wrong with it is the thing
      worth showing, and the list below is in the order an operator
      would act. */
  const claim = (rideId: string): boolean => {
    if (seen.has(rideId)) return false;
    seen.add(rideId);
    return true;
  };

  for (const r of rides) {
    const mins = minutesUntil(r.scheduledAt, now);
    const route = `${r.pickup || "—"} → ${r.dropoff || "—"}`;
    const who = r.guestName || "A guest";

    // A booking that lost its time. Broken, and invisible to every
    // other screen's sorting, so it is the one thing that outranks a
    // ride that is merely close.
    if (!r.scheduledAt && !isClosed(r)) {
      if (claim(r.id)) {
        items.push({
          id: `no-time:${r.id}`, kind: "no-time", severity: "now", rideId: r.id, at: null,
          headline: "A booking with no date on it",
          detail: `${who}'s ${route} has no pickup time, so it sorts to the end of every list and no driver will see it in the pool. Fix the date on the booking.`,
        });
      }
      continue;
    }

    // ── the flight, when Cabby's knows anything about it ─────────────
    //
    // Undefined for almost every ride on almost every board: not an
    // airport arrival, no number typed, no row written yet, no key set.
    // Nothing below runs, and the board looks exactly as it did before
    // this existed.
    const f = flights.get(r.id);

    // A plane that is not coming outranks everything else that could be
    // wrong with the ride, and it has to be checked BEFORE the
    // unassigned block below. Otherwise the most valuable row on the
    // board reads "Nobody is driving Queen Beatrix, in 40 min — put a
    // driver on", about a flight that was cancelled last night. Staffing
    // a ride that will not happen is worse than not staffing it.
    if (f && !isClosed(r) && (f.state === "cancelled" || f.state === "diverted")) {
      if (claim(r.id)) {
        const gone = f.state === "cancelled";
        const driver = r.driverName || (r.driverId ? "The assigned driver" : null);
        items.push({
          id: `flight:${r.id}`,
          kind: gone ? "flight-cancelled" : "flight-diverted",
          // Always "now", at any hour of the window. There is nothing to
          // wait for: every hour this sits is an hour the guest is not
          // told and a driver keeps a slot they could be selling.
          severity: "now",
          rideId: r.id,
          at: r.scheduledAt,
          headline: gone
            ? `${f.flight} is cancelled — this ride is still on the board`
            : `${f.flight} isn't landing in Aruba`,
          detail: gone
            ? `${who}, ${route}. The flight isn't operating, so nobody should drive to the airport for it. ${
                driver ? `Take ${driver} off the ride and call the guest.` : "Call the guest before anybody is put on it."
              } Cancelling the booking does not release the card — the hold shows up on this list separately.`
            : `${who}, ${route}. ${f.flight} was diverted, so the pickup time on this booking means nothing until somebody knows where they are coming from. Call the guest first${
                driver ? ` and leave ${driver} on it for now` : ""
              } — a diverted flight often still arrives, just late and from somewhere else.`,
        });
      }
      continue;
    }

    // Nobody driving it, and close enough that the pool is not going to
    // solve it on its own.
    if (needsDriver(r) && mins !== null && mins < HORIZON_HOURS * 60) {
      if (claim(r.id)) {
        const urgent = mins < URGENT_MINUTES;
        const back = (r.notes ?? "").includes(HANDBACK);
        items.push({
          id: `unassigned:${r.id}`,
          kind: back ? "handed-back" : "unassigned",
          severity: urgent ? "now" : "soon",
          rideId: r.id,
          at: r.scheduledAt,
          // No article in front of the place: "the The Ritz-Carlton" is
          // what you get when a sentence assumes its own grammar about
          // a name somebody else typed.
          headline: back
            ? `Handed back and still unclaimed — ${when(mins)}`
            : `Nobody is driving ${route.split(" → ")[0]}, ${when(mins)}`,
          detail: back
            ? `A driver returned ${who}'s ${route} to the pool and nobody has taken it since. Put somebody on it, or it runs out of time in the pool.`
            : `${who}, ${route}. ${urgent ? "Inside the window where the pool is not going to clear it on its own — put a driver on." : "Still in the pool. Worth a driver by hand if nobody claims it today."}`,
        });
      }
      continue;
    }

    // ── the flight moved, and the booking did not ────────────────────
    //
    // Both of these want a driver on the ride and the car still at home:
    // the fix is "move the pickup or tell them", and neither sentence
    // can be written without somebody to tell. A ride nobody is driving
    // was already claimed above, where "put a driver on it" is the
    // bigger and still-correct job.
    //
    // Once the car is moving there is nothing left for an operator to
    // decide — the driver's own screen carries the flight from there —
    // so this is gated on driver_assigned rather than on !isClosed.
    // Cancelled and diverted are not, because a driver already en route
    // to a plane that does not exist is exactly who needs turning round.
    if (f && r.status === "driver_assigned" && mins !== null) {
      const drift = driftMinutes(f);
      const lands = minutesUntil(expectedAt(f), now);

      // Late. Urgent when the driver is about to set off for a plane
      // that is not there — inside the same ninety minutes the rest of
      // this board calls imminent.
      if (drift !== null && drift >= FLIGHT_LATE_MINUTES) {
        if (claim(r.id)) {
          items.push({
            id: `flight:${r.id}`, kind: "flight-late",
            severity: mins < URGENT_MINUTES ? "now" : "soon",
            rideId: r.id, at: r.scheduledAt,
            headline: `${f.flight} is running ${howLong(drift)} late — pickup is still ${when(mins)}`,
            detail: `${who}, ${route}. ${r.driverName || "The driver"} is booked to collect ${when(mins)} and the flight is not due down until ${when(lands)}. Move the pickup time or tell them to hold — as it stands they park at arrivals for ${howLong(drift)} on a fixed fare, and anything else they are holding today is at risk.`,
          });
        }
        continue;
      }

      // Early, and the tighter threshold: the cost of this one is a
      // guest standing in an arrivals hall, not a driver sitting in a
      // car. "Now" once the plane is down or nearly.
      if (drift !== null && drift <= -FLIGHT_EARLY_MINUTES) {
        if (claim(r.id)) {
          items.push({
            id: `flight:${r.id}`, kind: "flight-early",
            severity: lands !== null && lands < URGENT_MINUTES ? "now" : "soon",
            rideId: r.id, at: r.scheduledAt,
            headline: `${f.flight} lands ${howLong(drift)} early — pickup is ${when(mins)}`,
            detail: `${who}, ${route}. ${f.actual ? "The flight is already on the ground" : `The flight is due down ${when(lands)}`} and ${r.driverName || "the driver"} is not booked to collect until ${when(mins)}. Move the pickup up or ring them to leave now — nobody has told the guest to wait, and they will be at the kerb first.`,
          });
        }
        continue;
      }
    }

    // Somebody has it and has not moved, past the time the guest was
    // told to be ready. The only item on this list where the guest is
    // already standing somewhere.
    //
    // AFTER the flight block above on purpose: a driver sitting still
    // through a two-hour delay is a driver doing the right thing, and
    // "call them, they haven't set off" over that is the false alarm
    // that teaches an operator to stop reading this list.
    if (r.status === "driver_assigned" && mins !== null && mins < -LATE_MINUTES && !isClosed(r)) {
      if (claim(r.id)) {
        items.push({
          id: `late:${r.id}`, kind: "not-under-way", severity: "now", rideId: r.id, at: r.scheduledAt,
          headline: `${r.driverName || "The driver"} hasn't set off — pickup was ${when(mins)}`,
          detail: `${who} was told ${route.split(" → ")[0]}. The ride is still on "assigned", so either the driver hasn't tapped anything or they aren't going. Call them.`,
        });
      }
      continue;
    }

    // Two jobs, one driver, one hour.
    const others = clash.get(r.id);
    if (others && others.length && mins !== null && mins > -60) {
      if (claim(r.id)) {
        items.push({
          id: `clash:${r.id}`, kind: "double-booked", severity: "soon", rideId: r.id, at: r.scheduledAt,
          headline: `${r.driverName || "One driver"} is on two rides at once`,
          detail: `This ${when(mins)} run and ${others.length === 1 ? "another" : `${others.length} others`} within ${CLASH_MINUTES} minutes of it. Sometimes that is two hops off the same terminal; sometimes it is a guest left waiting. Move one if it is the second.`,
        });
      }
      continue;
    }

    // Assigned, and the guest's own booking shows nothing to look for
    // at the kerb — the bug claim_ride() was fixed for, seen from the
    // operator's side and caught before somebody is at arrivals.
    if (r.driverId && !isClosed(r) && !r.driverPlate && !r.driverVehicle) {
      if (claim(r.id)) {
        items.push({
          id: `blind:${r.id}`, kind: "no-car-shown", severity: "soon", rideId: r.id, at: r.scheduledAt,
          headline: `${who} has no car to look for`,
          detail: `${r.driverName || "The driver"} is on this ride but has no car on record, so the booking shows the guest no plate and no vehicle. They fill that in under Profile in the driver portal.`,
        });
      }
      continue;
    }

    // The card failed while the ride is still live work.
    if (r.paymentStatus === "failed" && !isClosed(r)) {
      if (claim(r.id)) {
        items.push({
          id: `payfail:${r.id}`, kind: "payment-failed", severity: "soon", rideId: r.id, at: r.scheduledAt,
          headline: `${who}'s card didn't go through`,
          detail: `Stripe last reported this booking as failed and the ride is still on the board. Either the guest retries, or somebody decides whether it runs anyway.`,
        });
      }
      continue;
    }

    // Cancelled with money still against it. There is no refund path in
    // this project — see admin_cancel_ride — so this is the only place
    // anybody is told the card is still holding.
    if (r.status === "cancelled" && (r.paymentStatus === "authorized" || r.paymentStatus === "paid")) {
      if (claim(r.id)) {
        const held = r.paymentStatus === "authorized";
        items.push({
          id: `money:${r.id}`, kind: "money-outstanding", severity: "watch", rideId: r.id, at: r.scheduledAt,
          headline: held ? `A cancelled booking still has a hold on it` : `A cancelled booking was already charged`,
          detail: `${who}, ${route}. ${held ? "Void the authorisation" : "Refund the charge"} in Stripe — nothing in this app can do it, and nothing here will chase it again.`,
        });
      }
    }
  }

  if (drivers) {
    // A suspended driver keeps the rides they already hold, on purpose:
    // stripping them at 5am leaves guests waiting for cars nobody is
    // driving. But somebody has to decide about each one.
    for (const d of drivers) {
      if (d.status !== "suspended") continue;
      const held = rides.filter((r) => r.driverId === d.id && !isClosed(r));
      if (!held.length) continue;
      items.push({
        id: `held:${d.id}`, kind: "suspended-holding", severity: "soon", driverId: d.id,
        at: held[0].scheduledAt,
        headline: `${d.fullName || "A driver on hold"} still holds ${held.length} ride${held.length === 1 ? "" : "s"}`,
        detail: `Putting a driver on hold stops them taking NEW work; it does not take back what they have. Decide whether somebody else should drive ${held.length === 1 ? "it" : "them"}.`,
      });
    }

    // Somebody applied and is sitting outside the portal reading
    // "Application received" until a person acts.
    const waiting = drivers.filter((d) => d.status === "pending" && d.id);
    if (waiting.length) {
      items.push({
        id: "waiting-approval", kind: "waiting-approval", severity: "watch",
        driverId: waiting[0].id, at: null,
        headline: `${waiting.length} driver${waiting.length === 1 ? " is" : "s are"} waiting on approval`,
        detail: waiting.length === 1
          ? `${waiting[0].fullName || "One applicant"} can't take any work until somebody approves them.`
          : `They can't take any work until somebody approves them.`,
      });
    }
  }

  return items.sort((a, b) => {
    const r = RANK[a.severity] - RANK[b.severity];
    if (r !== 0) return r;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at.localeCompare(b.at);
  });
}

/**
 * Whether a driver can be put on a ride without the guest losing the
 * one thing they were given to look for.
 *
 * Re-exported through here rather than re-derived, so "can this driver
 * be recognised" means one thing on both sides of the company.
 */
export function guestCanSpot(d: DriverProfile): boolean {
  return identifiable(d);
}

/** Live work in one driver's hands right now — the "current ride"
    column on the directory, and the reason a driver cannot be quietly
    taken off the road. */
export function currentRide(driverId: string, rides: AdminRide[]): AdminRide | null {
  const mine = rides.filter((r) => r.driverId === driverId && isLive(r));
  if (mine.length) return mine[0];
  const next = rides
    .filter((r) => r.driverId === driverId && r.status === "driver_assigned" && r.scheduledAt)
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  return next[0] ?? null;
}
