import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { from: string[]; rpc: [string, unknown][]; eq: [string, unknown][] } = { from: [], rpc: [], eq: [] };
let rpcResult: unknown = { ok: true, ride_id: "r1" };
let rpcError: unknown = null;
let singleResult: unknown = null;

vi.mock("../../lib/supabase", () => {
  const builder = (table: string) => {
    calls.from.push(table);
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: (col: string, val: unknown) => { calls.eq.push([col, val]); return b; },
      in: chain,
      order: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: singleResult, error: null }),
      update: () => ({ eq: (col: string, val: unknown) => { calls.eq.push([col, val]); return Promise.resolve({ data: null, error: null }); } }),
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

import { loadOpen, loadAssigned, claimRide, setRideStatus, loadDriverById, setOnline } from "./driver";

beforeEach(() => {
  calls.from = []; calls.rpc = []; calls.eq = [];
  rpcResult = { ok: true, ride_id: "r1" }; rpcError = null;
  singleResult = null;
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

  // Regression: drivers has its own primary key separate from the account
  // it belongs to. `id` is that internal key; `user_id` is what actually
  // points at auth.users. Matching on `id` silently finds nothing for
  // every real driver — this pins the fix in place.
  it("looks up a driver by user_id, not by the row's own id", async () => {
    singleResult = { user_id: "d1", first_name: "Ana", last_name: "Croes", status: "approved", trips_count: 3 };
    await loadDriverById("d1");
    expect(calls.eq).toContainEqual(["user_id", "d1"]);
    expect(calls.eq.some(([col]) => col === "id")).toBe(false);
  });

  it("returns the auth uid as the profile id, not the drivers row's own id", async () => {
    // rides.driver_id and both RPCs key on auth.uid() — if this returned
    // the row's internal id instead, loadAssigned(driver.id) downstream
    // would silently query the wrong column and find nothing
    singleResult = { id: "internal-row-pk", user_id: "d1", first_name: "Ana", status: "approved" };
    const driver = await loadDriverById("d1");
    expect(driver?.id).toBe("d1");
  });

  it("combines first_name and last_name when there is no full_name column", async () => {
    singleResult = { user_id: "d1", first_name: "Ana", last_name: "Croes", status: "approved" };
    const driver = await loadDriverById("d1");
    expect(driver?.fullName).toBe("Ana Croes");
  });

  it("updates online status by user_id too", async () => {
    await setOnline(true);
    expect(calls.eq).toContainEqual(["user_id", "d1"]);
  });
});
