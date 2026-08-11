// The driver portal's only conversation with Supabase.
//
// Two rules from the brief live here and nowhere else:
//  · unassigned jobs come from the open_rides VIEW, never the rides table,
//    because the view withholds the passenger's identity and the pin until
//    the ride is actually theirs;
//  · accepting calls the claim_ride RPC, never an update, so two drivers
//    tapping at the same moment cannot both win.
import { supabase } from "../../lib/supabase";
import { arubaInstant } from "../../lib/datetime";

export type DriverStatus = "pending" | "approved" | "suspended";

export interface DriverProfile {
  id: string;
  fullName: string;
  phone: string | null;
  vehicle: string | null;
  plate: string | null;
  status: DriverStatus;
  rating: number | null;
  tripsCount: number;
  isOnline: boolean;
}

/** A claimable job. Deliberately has no passenger contact and no pin. */
export interface OpenJob {
  id: string;
  status: string;
  scheduledAt: string | null;
  pickup: string;
  dropoff: string;
  vehicle: string | null;
  passengers: number | null;
  luggage: number | null;
  childSeats: number | null;
  fare: number | null;
  bookingRef: string | null;
}

/** An assigned job — everything above, plus what was withheld. */
export interface AssignedJob extends OpenJob {
  contactName: string | null;
  contactPhone: string | null;
  flightNumber: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupNote: string | null;
  /** set only by loadCompleted — when the money was actually earned */
  completedAt?: string | null;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const nNum = (v: unknown): number | null => (typeof v === "number" ? v : null);

// The rides table inserts in three tiers — core, +coords, +contact — so an
// older row may only have the earliest one (see bookingPayload.ts). Same
// columns, same fallback order MyTrips.tsx already uses; this is the one
// place the driver side does it, so both readers of `rides` (this file's
// select("*") calls and the open_rides view, which passes every tiered
// column through raw) land on the same value.
function effectiveScheduledAt(r: Row): string | null {
  const date = nStr(r.scheduled_date);
  if (date) return arubaInstant(date, nStr(r.scheduled_time) ?? "");
  return nStr(r.scheduled_at);
}

function toOpen(r: Row): OpenJob {
  return {
    id: str(r.id),
    status: str(r.status) || "confirmed",
    scheduledAt: effectiveScheduledAt(r),
    pickup: str(r.pickup_location),
    dropoff: str(r.dropoff_location),
    vehicle: nStr(r.vehicle_class) ?? nStr(r.vehicle_type),
    passengers: nNum(r.passengers_count),
    luggage: nNum(r.luggage_count),
    childSeats: nNum(r.child_seats),
    fare: nNum(r.fare_total) ?? nNum(r.price),
    bookingRef: nStr(r.booking_ref),
  };
}

function toAssigned(r: Row): AssignedJob {
  return {
    ...toOpen(r),
    contactName: nStr(r.contact_name),
    contactPhone: nStr(r.contact_phone),
    flightNumber: nStr(r.flight_number),
    pickupLat: nNum(r.pickup_lat),
    pickupLng: nNum(r.pickup_lng),
    pickupNote: nStr(r.pickup_note),
  };
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in Supabase user, independent of whether a drivers row exists
 * for them. Split from loadDriverById so the gate can tell "not signed in"
 * apart from "signed in, but this account has no driver profile" — those
 * need different screens and different fixes.
 */
export async function getAuthedUser(): Promise<AuthedUser | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

/**
 * The drivers row for a given auth uid, or null when none exists — either
 * because docs/driver-schema.sql hasn't been run, or the row's status
 * check found nothing (see below).
 *
 * Matches on `user_id`, not `id`: this project's drivers table has its own
 * primary key separate from the account it belongs to, with `user_id` as
 * the column that actually points at auth.users. `DriverProfile.id` is
 * deliberately set to the auth uid passed in, not the row's own id —
 * rides.driver_id and both RPCs key on auth.uid(), so everything
 * downstream (loading a driver's assigned rides, claiming, status
 * changes) needs the auth id, not the drivers row's internal one.
 */
export async function loadDriverById(uid: string): Promise<DriverProfile | null> {
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) return null;

  const r = data as Row;
  const status = str(r.status);
  const splitName = [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim();
  return {
    id: uid,
    fullName: splitName || str(r.full_name),
    phone: nStr(r.phone),
    vehicle: nStr(r.vehicle),
    plate: nStr(r.plate),
    status: (status === "approved" || status === "suspended" ? status : "pending") as DriverStatus,
    rating: nNum(r.rating),
    tripsCount: nNum(r.trips_count) ?? 0,
    isOnline: r.is_online === true,
  };
}

export async function setOnline(isOnline: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return;
  await supabase.from("drivers").update({ is_online: isOnline }).eq("user_id", uid);
}

/** Today's assigned work, soonest first. */
export async function loadAssigned(driverId: string): Promise<AssignedJob[]> {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driverId)
    .in("status", ["driver_assigned", "en_route", "arrived", "in_progress"])
    .order("scheduled_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return (data as Row[]).map(toAssigned);
}

/**
 * Finished work, most recent first. Ordered and dated by completed_at,
 * not scheduled_at: a job booked Friday and driven Saturday belongs to
 * Saturday's money.
 */
export async function loadCompleted(driverId: string, limit = 60): Promise<AssignedJob[]> {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driverId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return (data as Row[]).map((r) => ({ ...toAssigned(r), completedAt: nStr(r.completed_at) }));
}

/**
 * Claimable work. The view, not the table — see the note at the top.
 *
 * Returns the error rather than swallowing it. This one query is the whole
 * pool, and the two ways it can come back empty need different words on
 * screen: "nothing to claim right now" is the quiet, ordinary case, while a
 * missing view or an RLS policy that won't admit unclaimed rides is a setup
 * problem that will never fix itself. Reporting both as [] hid exactly that
 * — the pool read "Pool's empty" while rides were piling up behind it.
 */
export interface OpenPool {
  jobs: OpenJob[];
  /** non-null when the query itself failed, not when nobody has booked */
  error: string | null;
}

export async function loadOpen(): Promise<OpenPool> {
  const { data, error } = await supabase
    .from("open_rides")
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (error) return { jobs: [], error: error.message };
  if (!Array.isArray(data)) return { jobs: [], error: null };
  return { jobs: (data as Row[]).map(toOpen), error: null };
}

export type ClaimReason = "already_taken" | "not_approved" | "unknown";

export type ClaimResult =
  | { ok: true; rideId: string }
  /** `detail` carries the database's own words when there are any — a
   *  claim that fails silently is indistinguishable from a dead button. */
  | { ok: false; error: ClaimReason; detail?: string };

/**
 * Accept a job. Losing the race is normal, not a failure — the caller
 * quietly drops the card and refreshes rather than showing a dialog.
 */
export async function claimRide(rideId: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_ride", { p_ride_id: rideId });
  if (error) {
    return { ok: false, error: "unknown", detail: error.message || "The claim call failed." };
  }
  const r = (data ?? {}) as Row;
  if (r.ok === true) return { ok: true, rideId: str(r.ride_id) || rideId };
  const why = str(r.error);
  if (why === "already_taken" || why === "not_approved") return { ok: false, error: why };
  return { ok: false, error: "unknown", detail: why || "The claim was refused without a reason." };
}

export type RideStatus = "en_route" | "arrived" | "in_progress" | "completed";

export async function setRideStatus(rideId: string, status: RideStatus): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_ride_status", {
    p_ride_id: rideId,
    p_status: status,
  });
  if (error) return false;
  return ((data ?? {}) as Row).ok === true;
}

/** One ride the driver already holds. */
export async function loadRide(rideId: string): Promise<AssignedJob | null> {
  const { data, error } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
  if (error || !data) return null;
  return toAssigned(data as Row);
}
