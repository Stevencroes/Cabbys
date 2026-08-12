import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { from: string[]; rpc: [string, unknown][]; eq: [string, unknown][] } = { from: [], rpc: [], eq: [] };
let rpcResult: unknown = { ok: true, ride_id: "r1" };
let rpcError: unknown = null;
let singleResult: unknown = null;
let orderResult: unknown[] = [];
let orderError: { message: string } | null = null;

vi.mock("../../lib/supabase", () => {
  const builder = (table: string) => {
    calls.from.push(table);
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: (col: string, val: unknown) => { calls.eq.push([col, val]); return b; },
      in: chain,
      order: () => Promise.resolve({ data: orderError ? null : orderResult, error: orderError }),
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

import {
  loadOpen, loadAssigned, claimRide, setRideStatus, loadDriverById, setOnline,
  isImminent, IMMINENT_MINUTES,
} from "./driver";

beforeEach(() => {
  calls.from = []; calls.rpc = []; calls.eq = [];
  rpcResult = { ok: true, ride_id: "r1" }; rpcError = null;
  singleResult = null; orderResult = []; orderError = null;
});

describe("driver data layer", () => {
  it("reads claimable jobs from the open_rides view, never the rides table", async () => {
    await loadOpen();
    // the view withholds contact details and the pin until a ride is claimed
    expect(calls.from).toContain("open_rides");
    expect(calls.from).not.toContain("rides");
  });

  it("reports a failed pool read instead of passing it off as an empty pool", async () => {
    // an RLS policy that won't admit unclaimed rides looks exactly like
    // nobody having booked, unless the error survives the data layer
    orderError = { message: "permission denied for view open_rides" };
    const pool = await loadOpen();
    expect(pool.jobs).toEqual([]);
    expect(pool.error).toBe("permission denied for view open_rides");
  });

  it("reads assigned work from rides, where the full record lives", async () => {
    await loadAssigned("d1");
    expect(calls.from).toContain("rides");
  });

  it("reports a failed schedule read instead of calling it an empty day", async () => {
    // the same swallow that made the pool look empty; a driver whose jobs
    // can't be read must not be told they have none
    orderError = { message: "permission denied for table rides" };
    const res = await loadAssigned("d1");
    expect(res.jobs).toEqual([]);
    expect(res.error).toBe("permission denied for table rides");
  });

  describe("what counts as happening now", () => {
    const at = (mins: number) => ({ scheduledAt: new Date(Date.now() + mins * 60_000).toISOString() });

    it("treats a job inside the window as live", () => {
      expect(isImminent(at(20))).toBe(true);
      expect(isImminent(at(IMMINENT_MINUTES - 1))).toBe(true);
    });

    it("treats a job days away as scheduling, not dispatch", () => {
      expect(isImminent(at(60 * 24 * 3))).toBe(false);
      expect(isImminent(at(IMMINENT_MINUTES + 30))).toBe(false);
    });

    it("counts an overdue job as live — it still needs driving", () => {
      expect(isImminent(at(-45))).toBe(true);
    });

    it("treats a ride with no time on it as now, rather than hiding it", () => {
      expect(isImminent({ scheduledAt: null })).toBe(true);
    });
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
    expect(await claimRide("r1")).toEqual({ ok: false, error: "unknown", detail: "network" });
  });

  // A claim that fails without saying why is indistinguishable from a dead
  // button — which is exactly how it presented: tap Accept, nothing moves.
  it("carries the database's own words back for an unexplained refusal", async () => {
    rpcResult = { ok: false, error: "violates foreign key constraint" };
    const res = await claimRide("r1");
    expect(res).toMatchObject({ ok: false, error: "unknown" });
    expect((res as { detail?: string }).detail).toBe("violates foreign key constraint");
  });

  it("still treats losing the race as a plain outcome, with nothing to report", async () => {
    rpcResult = { ok: false, error: "already_taken" };
    const res = await claimRide("r1");
    expect(res).toEqual({ ok: false, error: "already_taken" });
    expect((res as { detail?: string }).detail).toBeUndefined();
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

  // Regression: these are the real rides columns, copied from
  // bookingPayload.ts — the insert code — not invented. A row a driver
  // actually sees uses pickup_location/dropoff_location/vehicle_type/
  // passengers_count, never the shorter names this mapper used to read.
  describe("real rides column names (bookingPayload.ts, not guessed ones)", () => {
    it("reads pickup, dropoff, vehicle and passenger count from their real columns", async () => {
      orderResult = [{
        id: "r1", status: "confirmed", booking_ref: "CB-1",
        pickup_location: "Queen Beatrix International Airport",
        dropoff_location: "The Ritz-Carlton Aruba",
        vehicle_type: "SUV", vehicle_class: null,
        passengers_count: 3, luggage_count: 2, child_seats: 0,
        scheduled_date: "2026-08-07", scheduled_time: "14:35",
        price: 6700, fare_total: null,
      }];
      const [job] = (await loadOpen()).jobs;
      expect(job.pickup).toBe("Queen Beatrix International Airport");
      expect(job.dropoff).toBe("The Ritz-Carlton Aruba");
      expect(job.passengers).toBe(3);
      // vehicle_class wins when both tiers are present; falls back to
      // vehicle_type (the core-tier column) otherwise
      expect(job.vehicle).toBe("SUV");
      // price is the core-tier fare column; fare_total only exists once
      // the later tier succeeded
      expect(job.fare).toBe(6700);
    });

    it("derives scheduledAt from scheduled_date + scheduled_time, the always-present columns", async () => {
      orderResult = [{
        id: "r1", status: "confirmed",
        pickup_location: "A", dropoff_location: "B",
        scheduled_date: "2026-08-07", scheduled_time: "14:35",
        scheduled_at: null, // later-tier column, absent on this row
      }];
      const [job] = (await loadOpen()).jobs;
      // 14:35 Aruba (UTC-4) is 18:35 UTC
      expect(job.scheduledAt).toBe("2026-08-07T18:35:00.000Z");
    });

    it("falls back to scheduled_at when scheduled_date is missing (older/partial rows)", async () => {
      orderResult = [{
        id: "r1", status: "confirmed",
        pickup_location: "A", dropoff_location: "B",
        scheduled_date: null, scheduled_time: null,
        scheduled_at: "2026-08-07T18:35:00.000Z",
      }];
      const [job] = (await loadOpen()).jobs;
      expect(job.scheduledAt).toBe("2026-08-07T18:35:00.000Z");
    });
  });
});
