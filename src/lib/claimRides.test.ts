import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("./supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { claimGuestRides } from "./claimRides";

describe("claimGuestRides", () => {
  beforeEach(() => rpc.mockReset());

  it("passes nothing in — the email is read server-side", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    const res = await claimGuestRides();
    expect(rpc).toHaveBeenCalledWith("claim_guest_rides");
    expect(res).toEqual({ claimed: 2, error: null });
  });

  it("stays quiet before the migration has been run", async () => {
    // The page below this works perfectly well without the function; it
    // just has nothing to claim. That must not read as a broken account.
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.claim_guest_rides' },
    });
    expect(await claimGuestRides()).toEqual({ claimed: 0, error: null });
  });

  it("does not swallow a real failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied for table rides" } });
    const res = await claimGuestRides();
    expect(res.claimed).toBe(0);
    expect(res.error).toMatch(/permission denied/);
  });
});
