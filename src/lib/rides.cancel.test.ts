import { describe, it, expect, vi, beforeEach } from "vitest";

// What each call answers with, per test.
let rpcAnswer: { data: unknown; error: { code?: string; message?: string } | null };
const rpc = vi.fn(() => Promise.resolve(rpcAnswer));
// Any direct write to the table is a failure of this test: the function
// is the only way a guest cancels, now the old UPDATE policy is gone.
const from = vi.fn();
vi.mock("./supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...(a as [])),
    from: (...a: unknown[]) => from(...(a as [])),
  },
}));

import { cancelRide } from "./rides";

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  rpcAnswer = { data: { ok: true }, error: null };
});

describe("a guest cancelling, through cancel_my_ride", () => {
  it("asks the function, with the ride's id", async () => {
    expect(await cancelRide("r1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("cancel_my_ride", { p_ride_id: "r1" });
    expect(from).not.toHaveBeenCalled();
  });

  // Asking twice is not an error: the first attempt landed, the answer
  // did not, and the guest pressed again.
  it("treats an already-cancelled booking as done", async () => {
    rpcAnswer = { data: { ok: true, already: true }, error: null };
    expect(await cancelRide("r1")).toEqual({ ok: true });
  });

  it("says why when the function refuses, in words the guest can act on", async () => {
    const cases: [string, RegExp][] = [
      ["already_underway", /already on the way/],
      ["pickup_passed", /pickup time has passed/],
      ["already_driven", /already been completed/],
      ["not_yours", /isn't on your account/],
      ["something_new", /can't be cancelled online/],
    ];
    for (const [error, want] of cases) {
      rpcAnswer = { data: { ok: false, error }, error: null };
      const res = await cancelRide("r1");
      expect(res.ok, error).toBe(false);
      if (!res.ok) expect(res.detail, error).toMatch(want);
    }
  });

  it("reports a failed request as a failure", async () => {
    rpcAnswer = { data: null, error: { code: "08006", message: "network" } };
    const res = await cancelRide("r1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.detail).toMatch(/couldn't cancel/i);
    expect(from).not.toHaveBeenCalled();
  });

  // The old fallback wrote to the table directly when the function was
  // missing. With the policy dropped that write can only be refused, so a
  // missing function is now what any other failed request is: a failure,
  // said plainly, and never a quiet retry by another route.
  it("does not fall back to writing the table when the function is missing", async () => {
    rpcAnswer = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cancel_my_ride" } };
    const res = await cancelRide("r1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.detail).toMatch(/couldn't cancel/i);
    expect(from).not.toHaveBeenCalled();
  });
});
