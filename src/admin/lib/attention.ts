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
  | "waiting-approval";

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
 */
export function attentionItems(
  rides: AdminRide[],
  drivers: DriverProfile[] | null,
  now: number = Date.now(),
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

    // Somebody has it and has not moved, past the time the guest was
    // told to be ready. The only item on this list where the guest is
    // already standing somewhere.
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
