// The guest checkout, and the one setting it silently depends on.
//
// Every booking made by somebody who is not signed in goes through
// signInAnonymously(). With the provider switched off in the Supabase
// dashboard the call RESOLVES with an error rather than throwing, which
// is how the real cause went missing: the catch never fired, the reason
// was dropped, and the guest was shown the insert policy's complaint
// over an invitation to sign in — for a booking that needs no account
// and a setting they cannot see.
import { describe, it, expect, vi, beforeEach } from "vitest";

// hoisted, because vi.mock's factory is lifted above every other
// statement in the file and cannot reach an ordinary const
const { auth, insert } = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), signInAnonymously: vi.fn() },
  insert: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth,
    from: () => ({ insert }),
  },
}));

import { createRide } from "./rides";
import type { BookingState } from "./bookingPayload";

/** enough of a draft for buildRidePayload to produce its tiers */
const draft = {
  pickup: "Queen Beatrix International Airport",
  dropoff: "Bucuti & Tara Beach Resort",
  date: "2026-09-20", time: "14:30",
  passengers: 2, luggage: 2,
  contactName: "A Guest", contactEmail: "guest@example.com", contactPhone: "+2975607336",
} as unknown as BookingState;

const rejects = (message: string) => ({
  select: () => ({ single: () => Promise.resolve({ data: null, error: { message } }) }),
});

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  insert.mockReturnValue(rejects('new row violates row-level security policy for table "rides"'));
});

describe("createRide, signed out", () => {
  // The fault as the owner met it: the provider is off, and the screen
  // talks about row-level security.
  it("names the switched-off provider, not the policy it ran into", async () => {
    auth.signInAnonymously.mockResolvedValue({
      data: { user: null },
      error: { message: "Anonymous sign-ins are disabled" },
    });

    const res = await createRide(draft);

    expect(res.ride).toBeNull();
    expect(res.error).toMatch(/anonymous sign-ins are switched off/i);
    expect(res.error).toMatch(/authentication → providers/i);
    // the database's own words are kept, but not as the headline
    expect(res.error).not.toMatch(/row-level security/i);
    expect(res.detail).toMatch(/anonymous sign-ins are disabled/i);
    // and it must not send them to a sign-in screen they don't need
    expect(res.needsAuth).toBe(false);
  });

  // The other half of the same rule: when the guest DID get an id, the
  // policy complaint is the real answer and must not be papered over.
  it("keeps the database's reason when the guest had an id all along", async () => {
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: "anon-1" } }, error: null });

    const res = await createRide(draft);

    expect(res.error).toMatch(/row-level security/i);
    expect(res.needsAuth).toBe(true);
  });

  it("books without complaint once anonymous sign-in answers", async () => {
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: "anon-1" } }, error: null });
    insert.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: "r1", booking_ref: "CB-1" }, error: null }) }),
    });

    const res = await createRide(draft);

    expect(res).toMatchObject({ ride: { id: "r1", bookingRef: "CB-1" }, error: null, needsAuth: false });
  });
});
