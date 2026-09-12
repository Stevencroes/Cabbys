// The guest's pickup pin — the half of the pin flow that was never built.
//
// The driver's ride screen has read rides.pickup_lat / pickup_lng /
// pickup_note since it was written, and nothing has ever written them.
// This is the writer, plus the two questions that decide whether a guest
// is asked at all.
//
// WHEN IT IS WORTH ASKING is the part worth reading twice. A pin is not
// free: it is a thing to do, in a checkout or on a trip page, and asking
// for one where it changes nothing spends a guest's patience and returns
// a worse answer than the name already gave.
//
//  · The airport has one arrivals hall. A pin there tells the driver what
//    the flight number already told them, and it is being asked of
//    somebody who has not landed yet.
//  · A resort in the catalog is a place this app knows the coordinates
//    of. The pin helps only at the margin — which entrance — and only if
//    dropped while standing there.
//  · A typed address is where it actually pays. Aruba's street addresses
//    are unreliable enough that this codebase already refuses to price
//    against them (see fareName in lib/quote.ts, and what "Villa Bucuti
//    3" does to a rate card). For a villa or an Airbnb the pin is the
//    only trustworthy answer there is.
import { supabase } from "./supabase";
import { AIRPORT, findPlaceByName } from "../data/places";

export type PinResult = { ok: true } | { ok: false; detail: string };

const REASONS: Record<string, string> = {
  off_island:
    "That location isn't in Aruba — your phone may have answered with an old position. Try again outside, or just describe the spot below.",
  not_yours: "We couldn't update that booking. It may have already been driven or cancelled.",
};

/** Save a pin, a note, or both. Nulls leave what is already stored alone. */
export async function setPickupPin(
  rideId: string,
  pin: { lat: number; lng: number } | null,
  note: string,
): Promise<PinResult> {
  const { data, error } = await supabase.rpc("set_pickup_pin", {
    p_ride_id: rideId,
    p_lat: pin?.lat ?? null,
    p_lng: pin?.lng ?? null,
    p_note: note,
  });
  if (error) return { ok: false, detail: error.message || "That didn't save. Please try again." };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === true) return { ok: true };
  const why = typeof r.error === "string" ? r.error : "";
  return { ok: false, detail: REASONS[why] ?? why ?? "That didn't save." };
}

/** Is a pin worth offering for this pickup at all? */
export function pinWorthAsking(pickup: string): boolean {
  return pickup.trim() !== "" && pickup.trim() !== AIRPORT.name;
}

/**
 * Is it worth PROMPTING for, rather than tucking behind a link?
 *
 * True when the pickup is not somewhere this app can already place — a
 * typed address, a villa, an Airbnb. Those are the rides where the
 * driver currently has a street name and a hope.
 */
export function pinWorthPrompting(pickup: string): boolean {
  return pinWorthAsking(pickup) && !findPlaceByName(pickup);
}

export type LocateFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export const LOCATE_MESSAGES: Record<LocateFailure, string> = {
  denied:
    "Your browser is blocking location. You can allow it in the address bar, or just describe the spot instead — a landmark works as well as a pin.",
  unavailable: "Your phone couldn't get a fix. Try again outdoors, or describe the spot instead.",
  timeout: "That took too long. Try again outdoors, or describe the spot instead.",
  unsupported: "This browser can't share a location. Describing the spot works just as well.",
};

/**
 * The phone's own answer to "where am I".
 *
 * One tap, no map. This is deliberately the only way to set coordinates
 * here: a draggable map pin is the hardest interaction on the screen for
 * anyone with imprecise aim or unfamiliar with satellite views, and it is
 * useless to a guest who is not standing at the pickup yet. Whoever IS
 * standing there gets a better answer from GPS than they would from
 * dragging, and whoever is not writes a sentence instead.
 */
export function locateMe(): Promise<
  { ok: true; lat: number; lng: number; accuracy: number } | { ok: false; why: LocateFailure }
> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, why: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        ok: true,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => resolve({
        ok: false,
        why: err.code === err.PERMISSION_DENIED ? "denied"
          : err.code === err.TIMEOUT ? "timeout"
          : "unavailable",
      }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}
