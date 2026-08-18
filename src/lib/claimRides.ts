// Handing a guest their own bookings back.
//
// Booking is guest-first on purpose: nobody is asked for a password before
// they are shown a price. The cost of that is a ride owned by an anonymous
// session rather than a person. claim_guest_rides() closes the gap — when
// someone makes a real account with the address they gave at checkout, the
// bookings made under that address move onto it.
//
// The matching happens server-side (docs/guest-claim.sql). Nothing here
// passes an email in, so this call cannot be pointed at someone else.
import { supabase } from "./supabase";

/** Postgres' "no such function" — the migration has not been run yet. */
const MISSING_FUNCTION = /42883|could not find the function|does not exist/i;

export interface ClaimResult {
  /** How many earlier bookings moved onto this account. */
  claimed: number;
  /** Set when the call failed for a reason worth knowing about. */
  error: string | null;
}

export async function claimGuestRides(): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_guest_rides");
  if (error) {
    // Before the migration is run this is expected, and the page below it
    // works perfectly well — it just shows nothing to claim.
    if (MISSING_FUNCTION.test(error.message ?? "")) return { claimed: 0, error: null };
    return { claimed: 0, error: error.message };
  }
  return { claimed: typeof data === "number" ? data : 0, error: null };
}
