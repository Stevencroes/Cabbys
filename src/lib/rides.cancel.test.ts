import { describe, it, expect, vi, beforeEach } from "vitest";

// What the query builder hands back from .update().eq().select().
let answer: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const select = vi.fn(() => Promise.resolve(answer));
vi.mock("./supabase", () => ({
  supabase: { from: () => ({ update: () => ({ eq: () => ({ select }) }) }) },
}));

import { cancelRide } from "./rides";

beforeEach(() => { select.mockClear(); });

describe("a guest cancelling", () => {
  it("succeeds when the row comes back", async () => {
    answer = { data: [{ id: "r1" }], error: null };
    expect(await cancelRide("r1")).toEqual({ ok: true });
  });

  // The fault this guards: RLS blocks the UPDATE by matching nothing, and
  // Postgres calls that success. The card used to flip to Cancelled while
  // the booking stayed live.
  it("reports a refusal when zero rows were changed, even with no error", async () => {
    answer = { data: [], error: null };
    const res = await cancelRide("r1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.detail).toMatch(/can no longer be cancelled online/);
  });

  it("reports a failure when the request itself fails", async () => {
    answer = { data: null, error: { message: "network" } };
    const res = await cancelRide("r1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.detail).toMatch(/couldn't cancel/i);
  });

  it("asks for the row back, which is how a refusal becomes visible", async () => {
    answer = { data: [{ id: "r1" }], error: null };
    await cancelRide("r1");
    expect(select).toHaveBeenCalledWith("id");
  });
});
