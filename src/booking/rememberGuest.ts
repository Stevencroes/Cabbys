// The other half of a conversation the booking flow was only having in
// one direction.
//
// Step3Details already READS the account: the effect at the top of it
// fills a blank name, email and phone from user_metadata, "so nobody
// retypes their own name at an arrivals gate". Nothing had ever WRITTEN
// it. src/pages/Profile.tsx is the only writer, and it is a page most
// travellers never open — so a guest who signed in, booked, typed their
// name and their WhatsApp number, and came back in November to book the
// trip home was asked for all of it again. The prefill was aimed at an
// account that in practice stayed empty.
//
// So this is the return leg, and it is deliberately the smallest thing
// that closes it:
//
//  · THE BOOKING FLOW DOES NOT CHANGE. No step, no checkbox, no "save
//    my details?", no sign-up wall. This is called after the ride row
//    exists and its result is thrown away — see rememberGuestDetails.
//  · A GUEST WHO IS NOT SIGNED IN IS UNTOUCHED. Booking is guest-first
//    (src/lib/rides.ts), which means the session behind a booking is
//    often an ANONYMOUS Supabase user minted purely so the insert has an
//    auth.uid() for RLS. That session is a receipt, not an identity —
//    useAuth draws exactly that line with `account` — and writing a
//    stranger's name onto it would put their details on a shared
//    browser-local user id rather than on a person.
//  · IT ONLY FILLS BLANKS. A value already on the account is something
//    the traveller chose on their profile page; a name typed at checkout
//    is often somebody else's — a hotel booking for a guest, a parent
//    booking for a daughter. Overwriting on that basis would quietly
//    rename people.
//
// No migration. These two fields live in user_metadata, which the
// account holder owns and can write, and nothing downstream trusts them
// — the same reasoning written on src/pages/Profile.tsx when it chose
// metadata over a table of its own.
import { supabase } from "../lib/supabase";
import { fullNameOf, phoneOf } from "../lib/displayName";
import { isValidPhone, normalizePhone } from "../lib/contact";

export interface GuestDetails {
  name: string;
  phone: string;
}

/** What a call actually did, for tests and for nothing else — every
    caller ignores it on purpose (see the note on rememberGuestDetails). */
export type Remembered =
  | { saved: false; why: "signed-out" | "anonymous" | "nothing-new" | "failed" }
  | { saved: true; fields: Array<"full_name" | "phone"> };

/**
 * Put what the traveller just typed onto their account, if there is one
 * and it does not already say something else.
 *
 * NEVER await this on the path to payment, and never surface its result.
 * A booking that failed because a profile write failed would be the
 * worst trade in this codebase: the ride row already exists, the card is
 * about to be charged, and the traveller's name being on their account
 * is a convenience for their NEXT booking. It returns a reason rather
 * than throwing so that the behaviour can be tested; nothing in the app
 * reads it.
 */
export async function rememberGuestDetails(details: GuestDetails): Promise<Remembered> {
  let user;
  try {
    const { data } = await supabase.auth.getSession();
    user = data.session?.user;
  } catch {
    return { saved: false, why: "failed" };
  }
  if (!user) return { saved: false, why: "signed-out" };
  // The line useAuth draws, drawn again here rather than assumed: a guest
  // booking mints an anonymous user and Supabase persists it in
  // localStorage, so one browser's anonymous id is shared by everybody
  // who has ever booked from it. Writing a name there is writing it onto
  // a shared receipt.
  if (user.is_anonymous) return { saved: false, why: "anonymous" };

  const fields: { full_name?: string; phone?: string } = {};
  const wrote: Array<"full_name" | "phone"> = [];

  const name = details.name.trim().replace(/\s+/g, " ");
  // Blanks only. A name already on the account was chosen on the profile
  // page; the one typed at checkout is as likely to be the guest being
  // collected as the person paying.
  if (name.length >= 2 && !fullNameOf(user)) {
    fields.full_name = name;
    wrote.push("full_name");
  }

  // Normalised the same way the ride row's contact_phone is, so the
  // number that comes back as a prefill is the number that was stored —
  // otherwise the next booking's "already filled in" field differs by a
  // space from what the traveller typed and looks like somebody else's.
  const phone = normalizePhone(details.phone);
  if (phone && isValidPhone(phone) && !phoneOf(user)) {
    fields.phone = phone;
    wrote.push("phone");
  }

  if (wrote.length === 0) return { saved: false, why: "nothing-new" };

  try {
    // `data` merges into user_metadata rather than replacing it, which is
    // why one field can be written without reading and re-sending the
    // other — and why a Google account's own full_name survives this.
    const { error } = await supabase.auth.updateUser({ data: fields });
    if (error) return { saved: false, why: "failed" };
  } catch {
    return { saved: false, why: "failed" };
  }
  return { saved: true, fields: wrote };
}
