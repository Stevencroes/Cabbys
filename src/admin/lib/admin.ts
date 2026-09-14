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
  effectiveScheduledAt, toDriverProfile,
  type DriverProfile, type DriverStatus, type Row,
} from "../../driver/lib/driver";
import { todayInAruba } from "../../lib/datetime";

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
  driverVehicle: string | null;
  driverPlate: string | null;
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
    driverVehicle: nStr(r.driver_vehicle),
    driverPlate: nStr(r.driver_plate),
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

/** A ride nobody is driving — the only kind the Assign screen offers. */
export function needsDriver(r: AdminRide): boolean {
  return r.driverId === null && (r.status === "confirmed" || r.status === "pending");
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
