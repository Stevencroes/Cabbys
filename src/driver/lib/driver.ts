// The driver portal's only conversation with Supabase.
//
// Two rules from the brief live here and nowhere else:
//  · unassigned jobs come from the open_rides VIEW, never the rides table,
//    because the view withholds the passenger's identity and the pin until
//    the ride is actually theirs;
//  · accepting calls the claim_ride RPC, never an update, so two drivers
//    tapping at the same moment cannot both win.
import { supabase } from "../../lib/supabase";
import { driverPayoutUsd } from "../../lib/quote";
import { arubaInstant } from "../../lib/datetime";

export type DriverStatus = "pending" | "approved" | "suspended";

/** Did a write land, and if not, in whose words. Shared by every driver
    action that can be refused server-side. */
export type StatusResult = { ok: true } | { ok: false; detail: string };

export interface DriverProfile {
  id: string;
  fullName: string;
  /** the signed-in address — filled by the gate from auth, not the row */
  email: string | null;
  phone: string | null;
  /** the single free-text line older rows have, kept as a fallback */
  vehicle: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  year: number | null;
  /** capacity of the car, not the party on any one ride */
  seats: number | null;
  bags: number | null;
  photoUrl: string | null;
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
  /** the CUSTOMER's fare, in florin, exactly as the ride row stores it.
      Named for its currency and its owner on purpose: it was called `fare`,
      and every driver screen printed it under a dollar sign as though it
      were the driver's own money in dollars. It is neither. */
  fareAwg: number | null;
  /** what this job pays the DRIVER, in USD, after Cabby's commission —
      the only money figure a driver screen should ever show */
  payoutUsd: number | null;
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
  /**
   * Everything the booking was told, as one " · "-joined string.
   *
   * Written by Step3Details.ensureRide() and, until now, read by nothing.
   * It carries the typed address behind a custom pickup and the guest's
   * own note about it, the child seats WITH their ages, the flight's
   * landing or departure time, and the return leg — none of which the
   * driver had any other way to see. A villa pickup's entire usable
   * detail was sitting in this column being ignored.
   *
   * Assigned-only on purpose: open_rides omits it, because "Pickup
   * address: Villa Sunrise 14 (blue gate)" is exactly the kind of thing
   * the pool is designed not to hand out before a job is claimed.
   */
  bookingNotes: string | null;
  /** set only by loadCompleted — when the money was actually earned */
  completedAt?: string | null;
  /** when the driver reported reaching the pickup, and pulling away */
  arrivedAt: string | null;
  startedAt: string | null;
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
  const fare = nNum(r.fare_total) ?? nNum(r.price);
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
    fareAwg: fare,
    payoutUsd: fare == null ? null : driverPayoutUsd(fare),
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
    bookingNotes: nStr(r.notes),
    arrivedAt: nStr(r.arrived_at),
    startedAt: nStr(r.started_at),
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
 * The drivers row for a given auth uid.
 *
 * Answers in two parts on purpose: a missing ROW and an unreadable TABLE
 * are different problems with different fixes, and the gate has to say
 * which one it hit. See the note inside.
 *
 * Matches on `user_id`, not `id`: this project's drivers table has its own
 * primary key separate from the account it belongs to, with `user_id` as
 * the column that actually points at auth.users. `DriverProfile.id` is
 * deliberately set to the auth uid passed in, not the row's own id —
 * rides.driver_id and both RPCs key on auth.uid(), so everything
 * downstream (loading a driver's assigned rides, claiming, status
 * changes) needs the auth id, not the drivers row's internal one.
 */
export interface DriverLookup {
  /** null when this account genuinely has no drivers row */
  driver: DriverProfile | null;
  /** non-null when the table could not be read at all */
  error: string | null;
}

export async function loadDriverById(uid: string): Promise<DriverLookup> {
  const { data, error } = await supabase
    .from("drivers")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  // The distinction this function exists to make. `error` is a table that
  // could not be read — no migration, an RLS policy that admits nobody, a
  // dead connection. `!data` is a table that was read fine and has no row
  // for this account. Collapsing both to null is why a driver on a bad
  // hotel wifi was told their account does not exist.
  if (error) return { driver: null, error: error.message || "The drivers table could not be read." };
  if (!data) return { driver: null, error: null };

  const r = data as Row;
  const status = str(r.status);
  const splitName = [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ").trim();
  return {
    driver: {
      id: uid,
      fullName: splitName || str(r.full_name),
      email: nStr(r.email),
      phone: nStr(r.phone),
      vehicle: nStr(r.vehicle),
      plate: nStr(r.plate),
      make: nStr(r.vehicle_make),
      model: nStr(r.vehicle_model),
      colour: nStr(r.vehicle_colour),
      year: nNum(r.vehicle_year),
      seats: nNum(r.seats),
      bags: nNum(r.bags),
      photoUrl: nStr(r.photo_url),
      status: (status === "approved" || status === "suspended" ? status : "pending") as DriverStatus,
      rating: nNum(r.rating),
      tripsCount: nNum(r.trips_count) ?? 0,
      isOnline: r.is_online === true,
    },
    error: null,
  };
}

/**
 * Going on or off duty.
 *
 * Reports whether it landed. The shell flips the switch optimistically —
 * it has to, a toggle that waits for a round trip feels broken — but a
 * write that then fails leaves the portal saying "Online" over a database
 * row that says otherwise, and a driver sitting out a shift wondering why
 * no work is coming. Silence was the wrong answer to that.
 */
export async function setOnline(isOnline: boolean): Promise<boolean> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return false;
  const { error } = await supabase.from("drivers").update({ is_online: isOnline }).eq("user_id", uid);
  return !error;
}

/**
 * The driver's own phone number.
 *
 * The one field on the profile they are allowed to change, and the portal
 * used to say otherwise — "Message us to change them" sat under all three
 * rows, including this one. The database has always permitted it: see the
 * "drivers: update own" policy in docs/driver-schema.sql, which admits an
 * update to their own row and blocks only a change to `status`. Vehicle
 * and plate are Cabby's to set, and still say so; a number a guest has to
 * reach them on is theirs.
 */
export async function saveDriverPhone(phone: string): Promise<StatusResult> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return { ok: false, detail: "You're not signed in any more." };
  const { error } = await supabase.from("drivers").update({ phone }).eq("user_id", uid);
  if (error) return { ok: false, detail: error.message || "The change didn't save." };
  return { ok: true };
}

/** Today's assigned work, soonest first. */
export interface JobList {
  jobs: AssignedJob[];
  /** non-null when the query failed, not when the driver has no work */
  error: string | null;
}

export async function loadAssigned(driverId: string): Promise<JobList> {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driverId)
    .in("status", ["driver_assigned", "en_route", "arrived", "in_progress"])
    .order("scheduled_at", { ascending: true });
  if (error) return { jobs: [], error: error.message };
  if (!Array.isArray(data)) return { jobs: [], error: null };
  return { jobs: (data as Row[]).map(toAssigned), error: null };
}

/**
 * Work that was taken away.
 *
 * A ride cancelled under a driver used to leave their world without a
 * word: loadAssigned filters it out, loadCompleted never held it, and
 * nothing else asks. The job simply stopped being on the roster — which
 * on the morning of a 6am airport run is indistinguishable from the
 * roster being wrong, and a driver who trusts the roster drives to the
 * airport for a ride that was called off the night before.
 *
 * Read separately rather than folded into loadAssigned, because "the
 * work I have" and "the work I had" answer different questions: the
 * live-ride bar, the next-job figure and the jobs-left count all mean
 * the first, and quietly widening that query would have put a cancelled
 * ride in every one of them.
 */
export async function loadCancelled(driverId: string, limit = 40): Promise<JobList> {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driverId)
    .eq("status", "cancelled")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (error) return { jobs: [], error: error.message };
  if (!Array.isArray(data)) return { jobs: [], error: null };
  return { jobs: (data as Row[]).map(toAssigned), error: null };
}

/**
 * Finished work, most recent first. Ordered and dated by completed_at,
 * not scheduled_at: a job booked Friday and driven Saturday belongs to
 * Saturday's money.
 */
export async function loadCompleted(driverId: string, limit = 60): Promise<JobList> {
  const { data, error } = await supabase
    .from("rides")
    .select("*")
    .eq("driver_id", driverId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) return { jobs: [], error: error.message };
  if (!Array.isArray(data)) return { jobs: [], error: null };
  return {
    jobs: (data as Row[]).map((r) => ({ ...toAssigned(r), completedAt: nStr(r.completed_at) })),
    error: null,
  };
}

/**
 * Minutes until pickup, or null when the ride has no time on it.
 * Shared so "is this happening now?" means the same thing everywhere.
 */
export function minutesUntilPickup(job: Pick<OpenJob, "scheduledAt">, now = Date.now()): number | null {
  if (!job.scheduledAt) return null;
  const t = new Date(job.scheduledAt).getTime();
  return isNaN(t) ? null : Math.round((t - now) / 60_000);
}

/**
 * Claiming a job three days out is scheduling, not dispatch. Only a job
 * about to happen should drop the driver straight onto the live screen;
 * anything further away belongs in the agenda, where they can plan around
 * it. Ninety minutes is roughly "leave now or soon" for an island this
 * size — past that, opening the running-a-job screen would be a lie.
 */
export const IMMINENT_MINUTES = 90;

export function isImminent(job: Pick<OpenJob, "scheduledAt">, now = Date.now()): boolean {
  const mins = minutesUntilPickup(job, now);
  // no time at all → treat as now; already-late still counts as live
  return mins === null || mins <= IMMINENT_MINUTES;
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

/**
 * Same shape as ClaimResult, and for the same reason. This returned a
 * bare boolean, so the ride screen had nothing to say when a step
 * refused: the driver tapped "I've arrived", the button un-pressed
 * itself, and the ride stayed where it was with no word anywhere about
 * why. `not_yours` and `not_approved` are the two the database actually
 * answers with, and both are worth reading — one means the job was
 * reassigned under them, the other that their account has been
 * suspended mid-shift.
 */
const STATUS_REASONS: Record<string, string> = {
  not_yours: "This job isn't yours any more — it may have been reassigned.",
  not_approved: "Your account isn't approved to take jobs right now.",
  bad_status: "That step isn't allowed from where this ride is.",
  ride_closed: "This ride has been called off. Don't drive to it.",
};

export async function setRideStatus(rideId: string, status: RideStatus): Promise<StatusResult> {
  const { data, error } = await supabase.rpc("set_ride_status", {
    p_ride_id: rideId,
    p_status: status,
  });
  if (error) return { ok: false, detail: error.message || "The update didn't reach the server." };
  const r = (data ?? {}) as Row;
  if (r.ok === true) return { ok: true };
  const why = str(r.error);
  return { ok: false, detail: STATUS_REASONS[why] ?? why ?? "The update was refused." };
}

/**
 * Hand a job back to the pool.
 *
 * The inverse of claimRide, and the gap that made claiming feel one-way.
 * A driver whose car will not start has to be able to give a job back, or
 * the ride stays assigned to somebody who cannot drive it while the pool
 * shows nothing and dispatch knows nothing.
 *
 * Narrow on purpose, and the database is the one enforcing it: only a job
 * that has not started, and only outside the two-hour window where a
 * handback stops being scheduling and becomes a no-show. Inside it, the
 * answer is a phone call, and the screen says so instead of offering a
 * button that would be refused.
 */
const RELEASE_REASONS: Record<string, string> = {
  too_late:
    "It's too close to the pickup to hand back here. Message Cabby's — somebody has to be found and briefed, and that's a phone call.",
  already_started: "This job is already running, so it can't be handed back.",
  not_yours: "This job isn't yours any more.",
};

export async function releaseRide(rideId: string, reason: string): Promise<StatusResult> {
  const { data, error } = await supabase.rpc("release_ride", {
    p_ride_id: rideId,
    p_reason: reason,
  });
  if (error) return { ok: false, detail: error.message || "The handback didn't reach the server." };
  const r = (data ?? {}) as Row;
  if (r.ok === true) return { ok: true };
  const why = str(r.error);
  return { ok: false, detail: RELEASE_REASONS[why] ?? why ?? "The handback was refused." };
}

/**
 * Is a handback even on the table for this job?
 *
 * Mirrors what release_ride() will allow, so the portal never shows a
 * control the database is going to refuse. The server is still the
 * authority — this only decides whether to offer it.
 */
export const RELEASE_MINUTES = 120;

export function canRelease(job: Pick<AssignedJob, "status" | "scheduledAt">, now = Date.now()): boolean {
  if (job.status !== "driver_assigned") return false;
  const mins = minutesUntilPickup(job, now);
  return mins != null && mins > RELEASE_MINUTES;
}

/**
 * The car, in the words a guest identifies it by.
 *
 * Colour first, because somebody scanning a kerb outside arrivals sees a
 * colour before they see a badge. Falls back to the single free-text
 * `vehicle` line for a driver whose row predates the structured fields,
 * so nobody loses what they already had.
 */
export function vehicleLabel(d: Pick<DriverProfile, "colour" | "make" | "model" | "vehicle">): string {
  const built = [d.colour, d.make, d.model].filter(Boolean).join(" ").trim();
  return built || d.vehicle || "";
}

/**
 * Can a guest identify this driver at a kerb?
 *
 * The whole stamp chain — claim_ride writing the car onto the ride, My
 * Trips reading it back — does nothing at all for a driver who has not
 * said what they drive. An unfilled profile reproduces exactly the fault
 * the chain was built to fix, silently, one driver at a time. So this is
 * asked out loud in the portal rather than left to be discovered by a
 * guest standing outside arrivals.
 *
 * All four: a name, a car, a plate and a face. A name too, because "your
 * driver" beside a plate is worse than a name beside a plate and the
 * drivers row may have neither first_name nor full_name — and a face,
 * because a plate identifies the CAR and a guest is also deciding
 * whether to get in with the person holding the door.
 */
export function identifiable(d: DriverProfile): boolean {
  return Boolean(d.plate?.trim())
    && Boolean(vehicleLabel(d))
    && Boolean(d.fullName.trim())
    && Boolean(d.photoUrl?.trim());
}

export interface VehicleDetails {
  make: string;
  model: string;
  colour: string;
  year: number | null;
  plate: string;
  seats: number | null;
  bags: number | null;
  /** a newly uploaded photo's public URL, or null to keep the stored one */
  photoUrl?: string | null;
}

/**
 * Save the car — and re-stamp every ride of theirs that has not happened.
 *
 * The stamp on a ride is what a guest reads, and it is denormalised on
 * purpose: a passenger cannot read the drivers table at all, and the
 * stamp is the honest record of who drove on the day. The cost is that a
 * driver who changes cars on Tuesday leaves Monday's stamp on
 * Wednesday's booking, so the database updates both in one call. Rides
 * already driven keep the car that drove them.
 */
export async function saveVehicle(v: VehicleDetails): Promise<StatusResult> {
  const { data, error } = await supabase.rpc("save_driver_vehicle", {
    p_make: v.make,
    p_model: v.model,
    p_colour: v.colour,
    p_year: v.year,
    p_plate: v.plate,
    p_seats: v.seats,
    p_bags: v.bags,
    p_photo: v.photoUrl ?? null,
  });
  if (error) return { ok: false, detail: error.message || "The car didn't save." };
  const r = (data ?? {}) as Row;
  if (r.ok === true) return { ok: true };
  return {
    ok: false,
    detail: str(r.error) === "no_driver"
      ? "We can't find a driver record for this account."
      : str(r.error) || "The car wasn't saved.",
  };
}

/** What a photo may be, so a driver learns the limit before the upload. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Put a driver's face in the public bucket and hand back its URL.
 *
 * Named by their auth uid, which is what the storage policy keys on — a
 * driver can only ever overwrite their own. `upsert` because the second
 * photo has to replace the first rather than pile up beside it.
 */
export async function uploadDriverPhoto(file: File): Promise<
  { ok: true; url: string } | { ok: false; detail: string }
> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, detail: "That isn't an image — a photo from your phone's camera roll works." };
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return { ok: false, detail: "That photo is over 4MB. Most phones can send a smaller copy." };
  }
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return { ok: false, detail: "You're not signed in any more." };

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${uid}/face.${ext}`;
  const { error } = await supabase.storage
    .from("driver-photos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false, detail: error.message || "The photo didn't upload." };

  const { data } = supabase.storage.from("driver-photos").getPublicUrl(path);
  // a cache-buster, or the browser keeps showing the face they replaced
  return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
}

/** One ride the driver already holds. */
export async function loadRide(rideId: string): Promise<AssignedJob | null> {
  const { data, error } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
  if (error || !data) return null;
  return toAssigned(data as Row);
}
