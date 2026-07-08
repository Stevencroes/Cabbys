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
}

async function resolveUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return data.session.user.id;
  } catch { /* fall through */ }
  try {
    const anon = await supabase.auth.signInAnonymously();
    if (anon.data?.user) return anon.data.user.id;
  } catch { /* anonymous sign-in disabled — proceed as pure guest */ }
  return null;
}

export async function createRide(draft: BookingState): Promise<CreateRideResult> {
  const userId = await resolveUserId();
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

  const needsAuth = !userId || /row-level security|permission|policy|not.?null.*passenger/i.test(lastError ?? "");
  return { ride: null, error: lastError, needsAuth };
}

export async function cancelRide(rideId: string): Promise<string | null> {
  const { error } = await supabase
    .from("rides")
    .update({ status: "cancelled" })
    .eq("id", rideId);
  return error?.message ?? null;
}
