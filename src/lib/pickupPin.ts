// ── The guest's own pickup pin ────────────────────────────────────────
//
// Three kinds of pickup, and only one of them wants a coordinate.
//
//  · The AIRPORT is never asked. There is one private-transfer bay, the
//    name is not ambiguous, and the guest is not there yet — so a pin
//    here can only be wrong. It invites somebody in seat 24B to hand
//    their driver the hotel, or wherever the phone thinks it is. The map
//    already has an exact hand-set point for AUA that nothing should be
//    allowed to override; placePins.ts refuses to geocode it for the
//    same reason.
//
//  · A CATALOG PLACE — a resort, a hotel — is not asked either. The
//    catalog resolves it to its own door. What costs a driver ten
//    minutes at a big resort is not the building, it is which entrance:
//    lobby or beach side, tower A or tower B. Fifteen metres of GPS
//    cannot tell those apart and a driver cannot read latitude. That is
//    a note, and a note can be given weeks ahead because it is knowledge
//    rather than position.
//
//  · EVERYTHING ELSE — a villa, an apartment, a typed address — is where
//    a pin earns its keep. "Noord" is a district. A rental on an unlit
//    street with no visible number at 5am is exactly where drivers phone
//    the guest and wake them.
//
// And the timing, which is the part that makes it work at all: a pin
// dropped AT BOOKING and a pin dropped ON THE DAY are not the same
// thing. At booking the guest may be anywhere on earth, and asking them
// to mark a place they have never been is a map-search problem whose
// accuracy is their search skill. On the day they are standing on it and
// the phone knows to within about ten metres. So the coordinate is only
// offered inside a window around the pickup — see pinWindowOpen — and
// the note is offered the whole time.
//
// The pin never replaces the note. Coordinates get you within twenty
// metres; the landmark closes the last twenty. The driver's screen puts
// the note above the map for that reason and this must not undo it.
import { supabase } from "./supabase";
import { findPlaceByName } from "../data/places";

export type PinResult = { ok: true } | { ok: false; detail: string };

/**
 * The island, plus a margin of coastal water.
 *
 * These four numbers are duplicated in docs/pin-schema.sql ON PURPOSE and
 * MUST be changed together. The copy in the database is the one that
 * decides; this one exists so a guest who taps from the wrong continent
 * is told why before a round trip, rather than after one.
 *
 * The box stops well short of the neighbours: Curaçao begins near -69.2
 * and the Venezuelan mainland below 12.2.
 */
export const ARUBA_BOX = { minLat: 12.35, maxLat: 12.68, minLon: -70.15, maxLon: -69.80 };

export function inAruba(lat: number, lon: number): boolean {
  return lat >= ARUBA_BOX.minLat && lat <= ARUBA_BOX.maxLat
      && lon >= ARUBA_BOX.minLon && lon <= ARUBA_BOX.maxLon;
}

/** What this pickup is allowed to ask for. */
export type PinPolicy = "airport" | "place" | "address";

export function pinPolicyFor(pickup: string | null | undefined): PinPolicy {
  const place = findPlaceByName(pickup ?? "");
  if (!place) return "address";
  return place.area === "Airport" ? "airport" : "place";
}

/**
 * How long before the pickup the coordinate is worth asking for, and how
 * long after it stops being.
 *
 * Three hours is generous enough for someone already at the villa
 * packing up and short enough that nobody taps it from home the week
 * before. An hour afterwards is for the ride that is running late and
 * the driver who still cannot find them, which is the moment this
 * feature is actually for.
 */
export const PIN_OPENS_MINUTES = 180;
export const PIN_CLOSES_MINUTES = 60;

export function pinWindowOpen(scheduledAt: string | null | undefined, now = Date.now()): boolean {
  if (!scheduledAt) return false;
  const at = Date.parse(scheduledAt);
  if (Number.isNaN(at)) return false;
  return now >= at - PIN_OPENS_MINUTES * 60_000 && now <= at + PIN_CLOSES_MINUTES * 60_000;
}

/** The database's refusals, in words a guest reading them can act on. */
const WHY: Record<string, string> = {
  not_yours:
    "This booking isn't on your account any more. Message us and we'll sort it out.",
  already_cancelled:
    "This trip was cancelled, so there's no driver to send it to.",
  already_driven:
    "This trip is already finished.",
  not_in_aruba:
    "That spot isn't in Aruba. If you're still travelling, send it once you've landed — we'll ask again closer to your pickup.",
  note_too_long:
    "That's more than a driver can read at the kerb. Keep it under 140 characters.",
  half_a_pin:
    "Something went wrong reading your location. Try again, or type where to meet you.",
  nothing_to_save:
    "Nothing to send yet — drop your spot or type where to meet you.",
};

/**
 * Write the guest's pin, their note, or both.
 *
 * Both fields are optional and either may be sent alone, because they
 * arrive at different times: the note when the guest knows the answer,
 * the coordinate when they are standing on it. Sending note: "" clears
 * a note the guest wants gone; leaving it undefined leaves it alone.
 */
export async function savePickupPin(
  rideId: string,
  at: { lat?: number; lng?: number; note?: string },
): Promise<PinResult> {
  if (at.lat != null && at.lng != null && !inAruba(at.lat, at.lng)) {
    // Caught here as well as in the database. The round trip would end
    // in the same refusal, and this one arrives while the guest still
    // has the button under their thumb.
    return { ok: false, detail: WHY.not_in_aruba };
  }

  const { data, error } = await supabase.rpc("set_pickup_pin", {
    p_ride_id: rideId,
    p_lat: at.lat ?? null,
    p_lng: at.lng ?? null,
    p_note: at.note ?? null,
  });

  if (error) {
    return {
      ok: false,
      detail: error.message || "We couldn't save that just now. Try again in a moment.",
    };
  }

  const row = (data ?? {}) as { ok?: boolean; error?: string };
  if (row.ok === true) return { ok: true };

  const why = typeof row.error === "string" ? row.error : "";
  return { ok: false, detail: WHY[why] ?? why ?? "We couldn't save that just now." };
}

/**
 * The phone's answer, or the reason there isn't one.
 *
 * Every branch here ends in a sentence rather than a code, because the
 * guest has a plain alternative in every case — typing where to meet —
 * and the message is what tells them to take it.
 */
export function readPosition(): Promise<{ lat: number; lng: number } | { error: string }> {
  return new Promise((done) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      done({ error: "This browser can't share a location. Type where to meet you instead." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) {
          done({ error: "Your browser is blocking location for this page. You can still type where to meet you." });
        } else if (err.code === 3) {
          done({ error: "That took too long. Try again, or type where to meet you." });
        } else {
          done({ error: "Your phone couldn't get a fix. Try again outdoors, or type where to meet you." });
        }
      },
      // A pickup needs the good fix, and it is worth waiting for one.
      // maximumAge 0 because a cached position from the hotel this
      // morning is exactly the wrong answer to send a driver.
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}
