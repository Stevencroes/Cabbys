import { describe, it, expect, vi, beforeEach } from "vitest";

// What each call answers with, per test.
let rpcAnswer: { data: unknown; error: { code?: string; message?: string } | null };
let updateAnswer: { data: unknown; error: { message: string } | null };
const rpc = vi.fn(() => Promise.resolve(rpcAnswer));
const select = vi.fn(() => Promise.resolve(updateAnswer));
vi.mock("./supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...(a as [])),
    from: () => ({ update: () => ({ eq: () => ({ select }) }) }),
  },
}));

import { cancelRide } from "./rides";

beforeEach(() => {
  rpc.mockClear();
  select.mockClear();
  rpcAnswer = { data: { ok: true }, error: null };
  updateAnswer = { data: [{ id: "r1" }], error: null };
});

describe("a guest cancelling, through cancel_my_ride", () => {
  it("asks the function, with the ride's id", async () => {
    expect(await cancelRide("r1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("cancel_my_ride", { p_ride_id: "r1" });
    expect(select).not.toHaveBeenCalled();
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
    expect(select).not.toHaveBeenCalled();
  });
});

// Before docs/cancel-schema.sql is run, the function does not exist. The
// app must keep cancelling in that window — so the order the app and the
// SQL are deployed in never matters.
describe("before the SQL has been run", () => {
  beforeEach(() => {
    rpcAnswer = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cancel_my_ride" } };
  });

  it("falls back to the old path and succeeds when the row comes back", async () => {
    expect(await cancelRide("r1")).toEqual({ ok: true });
    expect(select).toHaveBeenCalledWith("id");
  });

  // The original silent failure: a refused UPDATE matches zero rows and
  // reports success. The fallback must still catch it.
  it("reports a refusal when the fallback changes zero rows", async () => {
    updateAnswer = { data: [], error: null };
    const res = await cancelRide("r1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.detail).toMatch(/can no longer be cancelled online/);
  });
});
