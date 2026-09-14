// Ride persistence — guest-first.
// Booking must never dead-end on "sign in first": if there is no session we
// try Supabase anonymous sign-in (link-able to a real account later); if
// that's disabled we insert without a passenger_id and let RLS decide.
import { supabase } from "./supabase";
import { buildRidePayload, type BookingState } from "./bookingPayload";

export interface CreatedRide {
  id: string;
  bookingRef: string | null;
}

export interface CreateRideResult {
  ride: CreatedRide | null;
  error: string | null;
  /** True when the failure looks like an auth/RLS wall — UI can offer sign-in. */
  needsAuth: boolean;
  /** the underlying reason a guest has no id, when that is what went wrong */
  detail?: string | null;
}

/**
 * Why the guest has no id, when they have none.
 *
 * v2. This used to return `null` for every failure and throw the reason
 * away, and the reason is the whole story. signInAnonymously() does not
 * THROW when the provider is switched off — it RESOLVES with an error in
 * the payload — so the catch below never fired, the cause was discarded,
 * and the booking went on to hit the insert policy as the `anon` role.
 *
 * What the guest then read was "new row violates row-level security
 * policy for table rides" over an invitation to sign in, for a booking
 * that needed no account and a setting they cannot see. It is the
 * failure this codebase keeps coming back to: a true error reported as
 * the wrong error, which sends whoever reads it the wrong way. It sent
 * me the wrong way for two rounds.
 */
type GuestId = { id: string | null; why: string | null };

async function resolveUserId(): Promise<GuestId> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return { id: data.session.user.id, why: null };
  } catch { /* no session is the ordinary case for a guest, not a fault */ }

  try {
    const anon = await supabase.auth.signInAnonymously();
    if (anon.data?.user) return { id: anon.data.user.id, why: null };
    // Resolved, and refused. This is the switched-off case.
    return { id: null, why: anon.error?.message ?? "anonymous sign-in returned no user" };
  } catch (e) {
    return { id: null, why: e instanceof Error ? e.message : "anonymous sign-in failed" };
  }
}

/**
 * The booking every guest makes signed out depends on one setting in a
 * dashboard nobody looks at twice: Authentication → Providers →
 * Anonymous sign-ins. With it off, every guest checkout fails and the
 * database's complaint is about a policy, which is true and useless.
 *
 * Named here so the next person reads the cause instead of the symptom.
 */
const ANON_OFF =
  "We couldn't start a guest booking. Anonymous sign-ins are switched off for this project — " +
  "turn them on in Supabase under Authentication → Providers, or sign in and book from your account.";

export async function createRide(draft: BookingState): Promise<CreateRideResult> {
  const { id: userId, why: noGuestId } = await resolveUserId();
  const { tiers } = buildRidePayload(draft, userId);

  let lastError: string | null = null;
  for (const payload of tiers) {
    const { data, error } = await supabase.from("rides").insert(payload).select().single();
    if (!error && data) {
      return {
        ride: { id: data.id, bookingRef: data.booking_ref ?? draft.bookingRef ?? null },
        error: null,
        needsAuth: false,
      };
    }
    lastError = error?.message ?? "Something went wrong. Please try again.";
  }

  const wall = /row-level security|permission|policy|not.?null.*passenger/i.test(lastError ?? "");

  // A guest with no id who then hit the policy wall did not fail at the
  // insert — they failed before it, and the insert is only where it
  // showed. Say the thing they can act on.
  if (!userId && wall) {
    return { ride: null, error: ANON_OFF, needsAuth: false, detail: noGuestId };
  }
  return { ride: null, error: lastError, needsAuth: !userId || wall, detail: noGuestId };
}

export async function cancelRide(rideId: string): Promise<string | null> {
  const { error } = await supabase
    .from("rides")
    .update({ status: "cancelled" })
    .eq("id", rideId);
  return error?.message ?? null;
}
