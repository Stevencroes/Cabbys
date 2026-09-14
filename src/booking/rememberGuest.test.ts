import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { user: unknown; updateError: { message: string } | null } =
  { user: null, updateError: null };
const updated = vi.fn();

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.user ? { user: state.user } : null } }),
      updateUser: (patch: unknown) => {
        updated(patch);
        return Promise.resolve({ data: {}, error: state.updateError });
      },
    },
  },
}));

import { rememberGuestDetails } from "./rememberGuest";

const details = { name: "Ana Croes", phone: "+297 560 1234" };

beforeEach(() => {
  state.user = null;
  state.updateError = null;
  updated.mockClear();
});

describe("remembering what a guest typed at checkout", () => {
  // THE NON-NEGOTIABLE ONE. Booking is guest-first: nobody is asked for
  // a password before they are shown a price, and a guest booking mints
  // an ANONYMOUS Supabase user only so the insert has an auth.uid() for
  // RLS. That session is a receipt, not an identity — and because
  // Supabase persists it in localStorage, one browser's anonymous id is
  // shared by everybody who has ever booked from it. Writing a name
  // there would put one traveller's details on a id belonging to all of
  // them.
  it("writes nothing for a guest booking under an anonymous session", async () => {
    state.user = { id: "anon-1", is_anonymous: true, user_metadata: {} };
    const res = await rememberGuestDetails(details);
    expect(res).toEqual({ saved: false, why: "anonymous" });
    expect(updated).not.toHaveBeenCalled();
  });

  it("writes nothing when nobody is signed in at all", async () => {
    const res = await rememberGuestDetails(details);
    expect(res).toEqual({ saved: false, why: "signed-out" });
    expect(updated).not.toHaveBeenCalled();
  });

  // The gap this closes. Step3Details has read the account into blank
  // fields for a long time; nothing had ever written it, so unless a
  // traveller went and found /profile their account stayed empty and
  // every booking started from a blank form.
  it("saves the name and number onto an account that has neither", async () => {
    state.user = { id: "u1", is_anonymous: false, user_metadata: {} };
    const res = await rememberGuestDetails(details);
    expect(res).toEqual({ saved: true, fields: ["full_name", "phone"] });
    expect(updated).toHaveBeenCalledWith({ data: { full_name: "Ana Croes", phone: "+2975601234" } });
  });

  // Blanks only, in both directions. A value already on the account is
  // one the traveller chose on their profile page; the name on a booking
  // is as likely to be the guest being collected — a hotel booking for a
  // visitor, a parent booking for a daughter. Overwriting on that basis
  // would quietly rename people.
  it("never overwrites a name the traveller already chose", async () => {
    state.user = { id: "u1", is_anonymous: false, user_metadata: { full_name: "A. Croes" } };
    const res = await rememberGuestDetails({ name: "Mrs Patricia Vrolijk", phone: "" });
    expect(res).toEqual({ saved: false, why: "nothing-new" });
    expect(updated).not.toHaveBeenCalled();
  });

  it("fills only the half that is missing", async () => {
    state.user = { id: "u1", is_anonymous: false, user_metadata: { full_name: "Ana Croes" } };
    const res = await rememberGuestDetails(details);
    expect(res).toEqual({ saved: true, fields: ["phone"] });
    // one key, not both — updateUser merges into user_metadata, so the
    // name that is already there is not read and re-sent to be clobbered
    expect(updated).toHaveBeenCalledWith({ data: { phone: "+2975601234" } });
  });

  // Normalised the same way the ride row's contact_phone is. Otherwise
  // the number stored here and the number stored on the booking differ
  // by a space, and the next booking's prefilled field looks like
  // somebody else's number.
  it("stores the number in the same shape the booking row does", async () => {
    state.user = { id: "u1", is_anonymous: false, user_metadata: {} };
    await rememberGuestDetails({ name: "Ana Croes", phone: "+297 560 1234" });
    expect(updated.mock.calls[0][0].data.phone).toBe("+2975601234");
  });

  it("does not save a half-typed number", async () => {
    state.user = { id: "u1", is_anonymous: false, user_metadata: { full_name: "Ana Croes" } };
    const res = await rememberGuestDetails({ name: "Ana Croes", phone: "+297 5" });
    expect(res).toEqual({ saved: false, why: "nothing-new" });
    expect(updated).not.toHaveBeenCalled();
  });

  // The ride row already exists by the time this is called and the card
  // is next. A booking that failed because a convenience write to
  // user_metadata failed would be the worst trade in this codebase — so
  // this answers rather than throws, and every caller ignores the answer.
  it("answers instead of throwing when the write fails", async () => {
    state.user = { id: "u1", is_anonymous: false, user_metadata: {} };
    state.updateError = { message: "network" };
    await expect(rememberGuestDetails(details)).resolves.toEqual({ saved: false, why: "failed" });
  });
});
