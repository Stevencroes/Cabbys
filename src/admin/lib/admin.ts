// The admin portal's only conversation with Supabase.
//
// Three rules from docs/admin-schema.sql live here and nowhere else:
//  · whether you are an operator is asked of is_admin(), a function, not
//    of the admins table — the table has one read policy and it admits
//    exactly your own row, so a table read could only ever answer for
//    you anyway, and the function answers without depending on it;
//  · reads are plain selects, admitted by two additive policies. An
//    admin sees every driver and every ride BECAUSE of those policies,
//    so a deployment where admin-schema.sql has not been run comes back
//    empty and silent — which is why every loader here returns its error
//    rather than an empty array (see the note on DriverList);
//  · writes are RPCs, never updates. RLS has no column list, so any
//    update policy loose enough to set drivers.status would also have
//    been loose enough to set rides.fare_total. The function signature
//    is the column list.
import { supabase } from "../../lib/supabase";
import {
  effectiveScheduledAt, toDocumentRecord, toDriverProfile,
  type DriverProfile, type DriverStatus, type Row,
} from "../../driver/lib/driver";
import type { DocumentRecord } from "../../driver/lib/documents";
import { addDays, todayInAruba } from "../../lib/datetime";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const nNum = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Is the signed-in account an operator?
 *
 * Three answers, not two. `isAdmin: false` means the database was asked
 * and said no; `error` means it could not be asked at all — an
 * unmigrated project where public.is_admin() does not exist yet, a dead
 * connection, a revoked grant. Collapsing those two into "not an admin"
 * is the same fault DriverGuard was rebuilt around: the owner of the
 * company would be told they are not an admin of their own dispatch
 * board, and would go looking for a permission problem that isn't there
 * instead of running the migration that is.
 */
export interface AdminCheck {
  isAdmin: boolean;
  /** non-null when the question could not be put to the database */
  error: string | null;
}

export async function checkIsAdmin(): Promise<AdminCheck> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    return { isAdmin: false, error: error.message || "The admin check could not be run." };
  }
  return { isAdmin: data === true, error: null };
}

/**
 * Every driver Cabby's has, in the order they were taken on.
 *
 * Ordered by created_at rather than by name because the question this
 * screen answers most often is "who is new and waiting", and a pending
 * driver applied yesterday is the one being looked for. The screen
 * pulls pending drivers to the top of that anyway; this just keeps the
 * tail stable between reads.
 */
export interface DriverList {
  drivers: DriverProfile[];
  /** non-null when the query failed, not when Cabby's has no drivers */
  error: string | null;
}

export async function loadAllDrivers(): Promise<DriverList> {
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return { drivers: [], error: error.message || "The drivers table could not be read." };
  if (!Array.isArray(data)) return { drivers: [], error: null };
  // user_id, never id — see the note on toDriverProfile. Every write
  // path below, and rides.driver_id, key on the auth id.
  return {
    drivers: (data as Row[]).map((r) => toDriverProfile(r, str(r.user_id))),
    error: null,
  };
}

/**
 * A ride as an operator reads it: the guest, the route, the money, and
 * who is holding it.
 *
 * Deliberately NOT the driver portal's OpenJob/AssignedJob. Those are
 * shaped around one driver's own work and carry payoutUsd — the
 * driver's cut, in dollars — which is the wrong figure on a dispatch
 * board: an operator reconciling a booking wants what the GUEST was
 * charged. The two shapes share the one thing they must share, which is
 * effectiveScheduledAt, so a ride is never at one time on the driver's
 * roster and another on the board.
 */
export interface AdminRide {
  id: string;
  status: string;
  scheduledAt: string | null;
  pickup: string;
  dropoff: string;
  vehicle: string | null;
  passengers: number | null;
  luggage: number | null;
  childSeats: number | null;
  /** the GUEST's fare, in florin, exactly as the ride row stores it */
  fareAwg: number | null;
  bookingRef: string | null;
  guestName: string | null;
  guestPhone: string | null;
  flightNumber: string | null;
  /** the auth uid of the driver holding it, or null — the thing the
      Assign screen exists for */
  driverId: string | null;
  /** what was STAMPED on the ride, which is what the guest actually
      sees in My Trips. Read back rather than joined, on purpose: a join
      would quietly rewrite history every time a driver changed cars. */
  driverName: string | null;
  driverPhone: string | null;
  driverVehicle: string | null;
  driverPlate: string | null;
  /** the guest's address, for the one place an operator needs to reach
      somebody who booked without an account. Not on any list — it is
      contact detail, and lists are for comparing. */
  guestEmail: string | null;
  /** the auth account that booked it, when there was one. Anonymous
      guests have one too (auth.signInAnonymously), so this groups a
      person's bookings even when they never made an account — it is the
      only stable key a customer view has, because a name and a phone
      number are typed fresh into every booking form. */
  passengerId: string | null;
  /** what Stripe last told us: authorized | paid | failed, or nothing at
      all on a booking taken before payment was wired. Never inferred
      from the ride's own status, which moves for reasons that have
      nothing to do with money. */
  paymentStatus: string | null;
  /** when the booking was made — the first mark on the timeline, and
      the only one that exists on every row */
  createdAt: string | null;
  /** the four stamps the ride collects as it happens. Each is written
      once by set_ride_status(); a null is a step not reached, never a
      step whose time was lost. */
  assignedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** everything the booking was told, " · "-joined — and, since
      release_ride and admin_cancel_ride append to the same column, the
      handback and cancellation reasons too. Split by the reader. */
  notes: string | null;
  /** a coordinate somebody actually dropped, when the guest-pin flow
      that writes these ever ships. Null on every row today — see the
      note in src/driver/screens/RideDetail.tsx — so the command view
      falls back to the pickup's name, and says which it is looking at. */
  pickupLat: number | null;
  pickupLng: number | null;
}

function toRide(r: Row): AdminRide {
  return {
    id: str(r.id),
    status: str(r.status) || "pending",
    scheduledAt: effectiveScheduledAt(r),
    pickup: str(r.pickup_location),
    dropoff: str(r.dropoff_location),
    vehicle: nStr(r.vehicle_class) ?? nStr(r.vehicle_type),
    passengers: nNum(r.passengers_count),
    luggage: nNum(r.luggage_count),
    childSeats: nNum(r.child_seats),
    fareAwg: nNum(r.fare_total) ?? nNum(r.price),
    bookingRef: nStr(r.booking_ref),
    guestName: nStr(r.contact_name),
    guestPhone: nStr(r.contact_phone),
    flightNumber: nStr(r.flight_number),
    driverId: nStr(r.driver_id),
    driverName: nStr(r.driver_name),
    driverPhone: nStr(r.driver_phone),
    driverVehicle: nStr(r.driver_vehicle),
    driverPlate: nStr(r.driver_plate),
    guestEmail: nStr(r.contact_email),
    passengerId: nStr(r.passenger_id),
    paymentStatus: nStr(r.payment_status),
    createdAt: nStr(r.created_at),
    assignedAt: nStr(r.assigned_at),
    arrivedAt: nStr(r.arrived_at),
    startedAt: nStr(r.started_at),
    completedAt: nStr(r.completed_at),
    notes: nStr(r.notes),
    pickupLat: nNum(r.pickup_lat),
    pickupLng: nNum(r.pickup_lng),
  };
}

export interface RideList {
  rides: AdminRide[];
  /** non-null when the query failed, not when the day is quiet */
  error: string | null;
}

/** How far back a board of "today and upcoming" is allowed to reach. */
const RIDE_LIMIT = 400;

/**
 * Today and everything ahead of it.
 *
 * Filtered on scheduled_date, not scheduled_at, and that is not an
 * arbitrary choice. src/lib/bookingPayload.ts inserts in three tiers
 * because "the production rides table has evolved; not every deployment
 * has every column" — scheduled_date and scheduled_time are core tier
 * and always present, while scheduled_at only exists on rows whose
 * later tier succeeded. A board filtered on scheduled_at would silently
 * drop every ride booked through the narrow path, which is exactly the
 * kind of ride an operator is looking for.
 *
 * Undated rows are kept rather than filtered out. A ride with no date is
 * broken, and a broken ride hidden from the one screen that could fix it
 * is a ride nobody ever fixes. They sort to the end and say so.
 */
export async function loadUpcomingRides(): Promise<RideList> {
  const today = todayInAruba();
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .or(`scheduled_date.gte.${today},scheduled_date.is.null`)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true })
    .limit(RIDE_LIMIT);
  if (error) return { rides: [], error: error.message || "The rides table could not be read." };
  if (!Array.isArray(data)) return { rides: [], error: null };

  // Sorted again here on the derived instant. The database ordered two
  // text columns, which is right for dated rows and says nothing about
  // a row whose time lives in scheduled_at instead.
  const rides = (data as Row[]).map(toRide).sort((a, b) => {
    if (!a.scheduledAt) return 1;
    if (!b.scheduledAt) return -1;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
  return { rides, error: null };
}

/**
 * Everything that has already happened, most recent first.
 *
 * The other half of the board's world. loadUpcomingRides answers "what
 * is coming"; this answers "what did we do", which is the question the
 * money screen and the customer list are both made of.
 *
 * Deliberately a SECOND query rather than widening the first one. The
 * upcoming board is read on every screen and is small; a year of
 * history is neither, and quietly folding it into the same call would
 * have put six hundred finished rides behind every filter tab on the
 * requests screen. Screens that need both ask for both.
 *
 * Bounded by days rather than by rows, because "the last ninety days"
 * is a period an operator can reason about and "the last four hundred
 * rides" is not — a busy month and a quiet one would reach back
 * different distances, and the monthly total would silently start
 * excluding the beginning of the month.
 */
export const HISTORY_DAYS = 120;

export async function loadRideHistory(days = HISTORY_DAYS): Promise<RideList> {
  const from = addDays(todayInAruba(), -days);
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .lt("scheduled_date", todayInAruba())
    .gte("scheduled_date", from)
    .order("scheduled_date", { ascending: false })
    .limit(RIDE_LIMIT * 2);
  if (error) return { rides: [], error: error.message || "The rides table could not be read." };
  if (!Array.isArray(data)) return { rides: [], error: null };
  const rides = (data as Row[]).map(toRide).sort((a, b) =>
    String(b.scheduledAt ?? "").localeCompare(String(a.scheduledAt ?? "")));
  return { rides, error: null };
}

/**
 * One ride, for the screen that is about that ride.
 *
 * Three answers, not two, for the reason every loader in this file has
 * three: a ride that is not there and a table that could not be read
 * send an operator to two different places, and the command view has to
 * say which — "this booking has been deleted" versus "run the
 * migration" is not a distinction to leave to a shrug.
 */
export interface RideLookup {
  ride: AdminRide | null;
  /** non-null when the query failed, not when the ride is gone */
  error: string | null;
}

export async function loadAdminRide(rideId: string): Promise<RideLookup> {
  const { data, error } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
  if (error) return { ride: null, error: error.message || "That ride could not be read." };
  if (!data) return { ride: null, error: null };
  return { ride: toRide(data as Row), error: null };
}

/**
 * The two reads, as one list, with nothing counted twice.
 *
 * loadUpcomingRides and loadRideHistory are disjoint by construction —
 * one takes scheduled_date >= today and the other < today — so in
 * practice this changes nothing today. It is here because the screens
 * that merge them are the money screen and the customer list, where a
 * duplicated row is not a cosmetic glitch: it is a guest credited with
 * a ride they took once and a day's revenue counted twice. A boundary
 * that depends on two queries staying exactly complementary is a
 * boundary worth defending on the near side.
 */
export function mergeRides(...lists: AdminRide[][]): AdminRide[] {
  const by = new Map<string, AdminRide>();
  for (const list of lists) for (const r of list) if (!by.has(r.id)) by.set(r.id, r);
  return [...by.values()];
}

/** A ride nobody is driving — the only kind admin_assign_ride takes. */
export function needsDriver(r: AdminRide): boolean {
  return r.driverId === null && (r.status === "confirmed" || r.status === "pending");
}

/** On a road right now: a driver has it and has started moving. */
export function isLive(r: AdminRide): boolean {
  return r.status === "en_route" || r.status === "arrived" || r.status === "in_progress";
}

/** Over, either way. Nothing on this board acts on one of these. */
export function isClosed(r: AdminRide): boolean {
  return r.status === "cancelled" || r.status === "completed";
}

/**
 * Change a driver's status.
 *
 * Adds one field to the house StatusResult shape: how many live rides
 * the driver still holds. Suspending does not take their work away —
 * a ride silently unassigned at 5am is a guest at arrivals waiting for
 * a car nobody is driving — but the operator has to be told, or the
 * consequence of the tap is invisible until the guest calls.
 */
const DRIVER_STATUS_REASONS: Record<string, string> = {
  not_admin: "This account isn't an admin any more. Sign in again, or ask whoever set you up.",
  bad_status: "That isn't a status a driver can be in.",
  no_driver: "There's no driver record for that account — it may have been removed.",
  // v2. The write was made and the row did not move. Said out loud
  // rather than shown as success: an operator who is told a driver is
  // on hold, and whose driver then keeps claiming from the pool, has
  // been actively misled.
  not_applied:
    "The change was accepted but the driver's status didn't move. Something in the database is putting it back — don't rely on this until it's looked at.",
};

export type DriverStatusResult =
  | { ok: true; heldRides: number }
  | { ok: false; detail: string };

export async function setDriverStatus(
  driverUserId: string,
  status: DriverStatus,
): Promise<DriverStatusResult> {
  // v2. An empty id is a drivers row with no user_id behind it. Sending
  // it reaches Postgres as an invalid uuid and comes back as a cast
  // error, which tells an operator nothing about what is actually
  // wrong. The board hides the controls on such a row; this is the same
  // answer for anything that gets past it.
  if (!driverUserId) {
    return {
      ok: false,
      detail: "That driver has no account linked yet, so there's nothing to approve. They need to sign up first.",
    };
  }
  const { data, error } = await supabase.rpc("admin_set_driver_status", {
    p_driver_user_id: driverUserId,
    p_status: status,
  });
  if (error) {
    return { ok: false, detail: error.message || "The change didn't reach the server." };
  }
  const r = (data ?? {}) as Row;
  if (r.ok === true) return { ok: true, heldRides: nNum(r.held_rides) ?? 0 };
  const why = str(r.error);
  return { ok: false, detail: DRIVER_STATUS_REASONS[why] ?? why ?? "The change was refused." };
}

/**
 * Put a driver on an unassigned ride.
 *
 * Hands back what was actually stamped onto the ride, because that — not
 * the row count — is the thing worth checking. A driver with no car on
 * record can be assigned perfectly successfully and still leave the
 * guest with a blank space where the car should be, which is the bug
 * this project spent a whole session fixing in claim_ride(). The screen
 * says so on the spot rather than leaving it to be discovered at a kerb.
 */
const ASSIGN_REASONS: Record<string, string> = {
  not_admin: "This account isn't an admin any more. Sign in again, or ask whoever set you up.",
  no_driver: "There's no driver record for that account — it may have been removed.",
  driver_not_approved: "That driver isn't approved to take jobs, so they can't be put on a ride.",
  no_ride: "That ride no longer exists.",
  already_taken: "Somebody already has this ride — a driver may have claimed it from the pool.",
  ride_closed: "This ride has been cancelled or completed, so it can't be assigned.",
};

export interface Stamped {
  name: string | null;
  vehicle: string | null;
  plate: string | null;
}

export type AssignResult =
  | { ok: true; stamped: Stamped }
  | { ok: false; detail: string };

export async function assignRide(rideId: string, driverUserId: string): Promise<AssignResult> {
  const { data, error } = await supabase.rpc("admin_assign_ride", {
    p_ride_id: rideId,
    p_driver_user_id: driverUserId,
  });
  if (error) {
    return { ok: false, detail: error.message || "The assignment didn't reach the server." };
  }
  const r = (data ?? {}) as Row;
  if (r.ok === true) {
    return {
      ok: true,
      stamped: {
        name: nStr(r.driver_name),
        vehicle: nStr(r.driver_vehicle),
        plate: nStr(r.driver_plate),
      },
    };
  }
  const why = str(r.error);
  return { ok: false, detail: ASSIGN_REASONS[why] ?? why ?? "The assignment was refused." };
}

/**
 * Take a ride back off the driver holding it.
 *
 * Half of "reassign", and the reason there is no reassign button that
 * does both in one tap: admin_assign_ride refuses a ride that already
 * has a driver, on purpose, because a booking that changes hands in a
 * single UPDATE changes somebody's morning with nothing said and leaves
 * the guest's My Trips row naming a car that is no longer coming.
 *
 * So the portal walks it: take it off — which clears the stamp and
 * returns the ride to the pool — and then put the next driver on. The
 * screen names who was taken off, because the phone call is the half of
 * this the database cannot do.
 */
const UNASSIGN_REASONS: Record<string, string> = {
  not_admin: "This account isn't an admin any more. Sign in again, or ask whoever set you up.",
  no_ride: "That ride no longer exists.",
  not_assigned: "Nobody is on this ride, so there's nothing to take off.",
  ride_closed: "This ride is already over, so it can't be moved.",
  // The driver is on a road. Whoever is driving it is now a question
  // being answered by a phone, not by a row update.
  already_started:
    "This driver has already set off. Taking it off them now would leave a guest with nobody coming — call the driver first, and move it once they've stopped.",
  moved_on:
    "The ride changed while this was open — the driver may have finished it or handed it back. It's been reloaded; have another look.",
};

export type UnassignResult =
  | { ok: true; driverName: string | null }
  | { ok: false; detail: string };

export async function unassignRide(rideId: string, reason: string): Promise<UnassignResult> {
  const { data, error } = await supabase.rpc("admin_unassign_ride", {
    p_ride_id: rideId,
    p_reason: reason,
  });
  if (error) return { ok: false, detail: error.message || "The change didn't reach the server." };
  const r = (data ?? {}) as Row;
  if (r.ok === true) return { ok: true, driverName: nStr(r.driver_name) };
  const why = str(r.error);
  return { ok: false, detail: UNASSIGN_REASONS[why] ?? why ?? "That was refused." };
}

/**
 * Call a booking off.
 *
 * The last thing on this board that was still a hand-typed UPDATE, and
 * the one write here that touches money — or rather, the one that
 * pointedly does not. There is no server-side Stripe path in this
 * project beyond authorize-and-capture: api/stripe-webhook.ts captures
 * on assignment and nothing anywhere voids or refunds, because that
 * needs the secret key and the browser will never hold one.
 *
 * So the result carries payment_status back and the screen says, in
 * words, whether money is still held or taken against the ride it just
 * cancelled. A cancellation that implied it had settled the card would
 * be the most expensive lie this portal could tell.
 */
const CANCEL_REASONS: Record<string, string> = {
  not_admin: "This account isn't an admin any more. Sign in again, or ask whoever set you up.",
  no_ride: "That ride no longer exists.",
  need_reason: "Say why it's being called off. Whoever reads this booking next has only this sentence.",
  already_cancelled: "This booking was already cancelled.",
  // Un-earning a completed ride would rewrite a driver's own Earnings
  // screen under them, which is the one figure they check.
  already_driven:
    "This ride has already been driven, so it can't be cancelled. If the money is wrong, that's a refund in Stripe, not a status change here.",
  moved_on: "The ride changed while this was open. It's been reloaded; have another look.",
};

export type CancelResult =
  | {
      ok: true;
      /** whose roster just lost a job, or null if nobody was on it */
      driverName: string | null;
      /** what Stripe last said. The screen turns this into the sentence
          about money that is still sitting against the booking. */
      paymentStatus: string | null;
    }
  | { ok: false; detail: string };

export async function cancelRide(rideId: string, reason: string): Promise<CancelResult> {
  const { data, error } = await supabase.rpc("admin_cancel_ride", {
    p_ride_id: rideId,
    p_reason: reason,
  });
  if (error) return { ok: false, detail: error.message || "The cancellation didn't reach the server." };
  const r = (data ?? {}) as Row;
  if (r.ok === true) {
    return { ok: true, driverName: nStr(r.driver_name), paymentStatus: nStr(r.payment_status) };
  }
  const why = str(r.error);
  return { ok: false, detail: CANCEL_REASONS[why] ?? why ?? "The cancellation was refused." };
}

/**
 * What is still owed to whoever cancelled it, said plainly.
 *
 * Three states and three different next moves, and the difference
 * between them is the difference between doing nothing and being out
 * the fare. Returns null when there is nothing to say — a booking taken
 * before payment was wired has no payment_status at all, and inventing
 * a money sentence for it would send somebody hunting a charge that was
 * never made.
 */
export function moneyStillOutstanding(paymentStatus: string | null): string | null {
  if (paymentStatus === "paid") {
    return "This card was already charged. Cancelling here does not refund it — that is a refund in the Stripe dashboard.";
  }
  if (paymentStatus === "authorized") {
    return "There is still a hold on this card. Cancelling here does not release it — void the authorisation in the Stripe dashboard.";
  }
  return null;
}

/**
 * Is this driver already busy around that time?
 *
 * Not a rule, a warning. The database will happily put one driver on two
 * airport runs forty minutes apart, and sometimes that is the right call
 * — a short hop either side of the same terminal. What is never right is
 * an operator doing it without noticing. Ninety minutes is the same
 * window the driver portal already treats as "leave now or soon"
 * (IMMINENT_MINUTES), so the two sides of the app agree about what
 * counts as a collision.
 */
export const CLASH_MINUTES = 90;

export function clashesFor(
  driverUserId: string,
  when: string | null,
  rides: AdminRide[],
): AdminRide[] {
  if (!when) return [];
  const t = new Date(when).getTime();
  if (isNaN(t)) return [];
  return rides.filter((r) => {
    if (r.driverId !== driverUserId || !r.scheduledAt) return false;
    if (r.status === "cancelled" || r.status === "completed") return false;
    const o = new Date(r.scheduledAt).getTime();
    return !isNaN(o) && Math.abs(o - t) < CLASH_MINUTES * 60_000;
  });
}

/* ── the application's paperwork ─────────────────────────────────────── */

/**
 * Every document every driver has sent, in one read.
 *
 * One query rather than one per row, and that is not only about speed:
 * the board shows a count against each of maybe thirty drivers, and
 * thirty round trips is thirty chances for some of them to fail while
 * the rest succeed — a board where four rows say "3 of 5" and one says
 * nothing, for no reason the operator can see. One query has one answer,
 * and it is either the documents or the reason there are none.
 *
 * Mapped with toDocumentRecord, the same function the driver's own
 * portal reads its rows through. A second mapper here would drift, and
 * the two screens would disagree about whether a document was accepted.
 *
 * Keyed by the driver's AUTH id, which is what driver_documents holds
 * and what every write path in this project takes.
 */
export interface AllDocuments {
  /** driver auth id → that driver's documents */
  byDriver: Map<string, DocumentRecord[]>;
  /** non-null when the query failed, not when nobody has sent anything.
      An operator told "no documents" over an unreadable table would go
      and ask five drivers to re-send what they already sent. */
  error: string | null;
}

export async function loadAllDriverDocuments(): Promise<AllDocuments> {
  const { data, error } = await supabase.from("driver_documents").select("*");
  if (error) {
    return {
      byDriver: new Map(),
      error: error.message || "The driver documents table could not be read.",
    };
  }
  const byDriver = new Map<string, DocumentRecord[]>();
  for (const row of Array.isArray(data) ? (data as Row[]) : []) {
    const uid = str(row.driver_user_id);
    if (!uid) continue;
    const list = byDriver.get(uid) ?? [];
    list.push(toDocumentRecord(row));
    byDriver.set(uid, list);
  }
  return { byDriver, error: null };
}

/**
 * A link to one document, good for a minute.
 *
 * The whole reason driver-docs is a private bucket. getPublicUrl() would
 * hand back a permanent URL to somebody's passport — forwardable, and
 * still working next year. A signed URL is minted for this operator, for
 * this object, and has stopped working by the time it could be pasted
 * anywhere it should not be.
 *
 * Sixty seconds is enough to open a tab and not much else. The operator
 * clicks View again if they come back to it, which costs a round trip
 * and nothing else.
 *
 * Returns its failure rather than a null link. A document that cannot be
 * signed is usually docs/onboarding-schema.sql not having been run — the
 * "driver docs: read as admin" policy is what permits the signature — and
 * a View button that does nothing would send somebody looking for a
 * broken file instead of a missing migration.
 */
export const DOCUMENT_LINK_SECONDS = 60;

export type DocumentLink =
  | { ok: true; url: string }
  | { ok: false; detail: string };

export async function signedDocumentUrl(path: string): Promise<DocumentLink> {
  const { data, error } = await supabase.storage
    .from("driver-docs")
    .createSignedUrl(path, DOCUMENT_LINK_SECONDS);
  if (error) return { ok: false, detail: error.message || "That document couldn't be opened." };
  const url = data?.signedUrl;
  if (!url) return { ok: false, detail: "That document couldn't be opened." };
  return { ok: true, url };
}

/**
 * Accept a document, or send it back with a reason.
 *
 * `seenAt` is the uploaded_at the board was showing when the operator
 * opened the file, and the database refuses the review if the driver has
 * replaced it since. That is not a rare race: the likeliest minute for a
 * driver to re-upload is the one right after a rejection told them to,
 * and an Accept that lands on a file nobody opened is the one outcome
 * this screen exists to prevent.
 *
 * A rejection with no reason is refused by the database, not just by the
 * form. A driver told "not accepted" with no sentence attached has no
 * move except messaging somebody, which is the process being replaced.
 */
const REVIEW_REASONS: Record<string, string> = {
  not_admin: "This account isn't an admin any more. Sign in again, or ask whoever set you up.",
  bad_status: "A document can only be accepted or sent back.",
  need_reason: "Say what's wrong with it. The driver sees this sentence and has to be able to act on it.",
  no_document: "That document isn't there any more — the driver may have replaced it.",
  moved_on: "The driver uploaded a new copy while you had this open. It's been reloaded — have a look at that one before deciding.",
  not_applied:
    "The change was accepted but the document didn't move. Something in the database is putting it back — don't rely on this until it's looked at.",
};

export type ReviewResult =
  | {
      ok: true;
      /** how many of this driver's documents are accepted now. A COUNT,
          not a verdict — the database has no idea how many Cabby's asks
          for, because that list is DRIVER_DOCUMENTS. The screen compares
          the two and says "all five" or "three of five". */
      acceptedCount: number;
      /** the driver's status, unchanged by this call and read back so
          the board can say "all five in — they're still waiting on
          approval". Accepting documents approves nobody. */
      driverStatus: string | null;
    }
  | { ok: false; detail: string };

export async function reviewDocument(
  driverUserId: string,
  slug: string,
  status: "accepted" | "rejected",
  reason: string | null,
  seenAt: string | null,
): Promise<ReviewResult> {
  const { data, error } = await supabase.rpc("admin_review_document", {
    p_driver_user_id: driverUserId,
    p_slug: slug,
    p_status: status,
    p_reason: reason,
    p_seen_at: seenAt,
  });
  if (error) return { ok: false, detail: error.message || "The decision didn't reach the server." };
  const r = (data ?? {}) as Row;
  if (r.ok === true) {
    return {
      ok: true,
      acceptedCount: nNum(r.accepted_count) ?? 0,
      driverStatus: nStr(r.driver_status),
    };
  }
  const why = str(r.error);
  return { ok: false, detail: REVIEW_REASONS[why] ?? why ?? "The decision was refused." };
}
