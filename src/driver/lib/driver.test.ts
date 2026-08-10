import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { from: string[]; rpc: [string, unknown][] } = { from: [], rpc: [] };
let rpcResult: unknown = { ok: true, ride_id: "r1" };
let rpcError: unknown = null;

vi.mock("../../lib/supabase", () => {
  const builder = (table: string) => {
    calls.from.push(table);
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain, eq: chain, in: chain,
      order: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    });
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (name: string, args: unknown) => {
        calls.rpc.push([name, args]);
        return Promise.resolve({ data: rpcResult, error: rpcError });
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: "d1" } } } }),
      },
    },
  };
});

import { loadOpen, loadAssigned, claimRide, setRideStatus } from "./driver";

beforeEach(() => {
  calls.from = []; calls.rpc = [];
  rpcResult = { ok: true, ride_id: "r1" }; rpcError = null;
});

describe("driver data layer", () => {
  it("reads claimable jobs from the open_rides view, never the rides table", async () => {
    await loadOpen();
    // the view withholds contact details and the pin until a ride is claimed
    expect(calls.from).toContain("open_rides");
    expect(calls.from).not.toContain("rides");
  });

  it("reads assigned work from rides, where the full record lives", async () => {
    await loadAssigned("d1");
    expect(calls.from).toContain("rides");
  });

  it("accepts a job through the RPC, not an update", async () => {
    const res = await claimRide("r1");
    expect(calls.rpc[0]).toEqual(["claim_ride", { p_ride_id: "r1" }]);
    expect(res).toEqual({ ok: true, rideId: "r1" });
  });

  it("reports losing the race as already_taken, not as a failure", async () => {
    rpcResult = { ok: false, error: "already_taken" };
    const res = await claimRide("r1");
    expect(res).toEqual({ ok: false, error: "already_taken" });
  });

  it("surfaces an unapproved driver distinctly", async () => {
    rpcResult = { ok: false, error: "not_approved" };
    expect(await claimRide("r1")).toEqual({ ok: false, error: "not_approved" });
  });

  it("moves status only through set_ride_status", async () => {
    rpcResult = { ok: true };
    expect(await setRideStatus("r1", "en_route")).toBe(true);
    expect(calls.rpc[0]).toEqual(["set_ride_status", { p_ride_id: "r1", p_status: "en_route" }]);
  });

  it("treats a transport error as a failed claim rather than a silent success", async () => {
    rpcError = { message: "network" };
    expect(await claimRide("r1")).toEqual({ ok: false, error: "unknown" });
  });
});
