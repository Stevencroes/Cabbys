import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { from: string[]; rpc: [string, unknown][]; eq: [string, unknown][] } = { from: [], rpc: [], eq: [] };
let rpcResult: unknown = { ok: true, ride_id: "r1" };
let rpcError: unknown = null;
let singleResult: unknown = null;
let singleError: { message: string } | null = null;
let orderResult: unknown[] = [];
let orderError: { message: string } | null = null;
let updateError: { message: string } | null = null;
const updates: Record<string, unknown>[] = [];

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
      maybeSingle: () => Promise.resolve({ data: singleError ? null : singleResult, error: singleError }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return { eq: (col: string, val: unknown) => { calls.eq.push([col, val]); return Promise.resolve({ data: null, error: updateError }); } };
      },
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
  saveDriverPhone, releaseRide, canRelease, vehicleLabel, identifiable,
  isImminent, IMMINENT_MINUTES, type DriverProfile,
} from "./driver";

beforeEach(() => {
  calls.from = []; calls.rpc = []; calls.eq = [];
  rpcResult = { ok: true, ride_id: "r1" }; rpcError = null;
  singleResult = null; singleError = null; orderResult = []; orderError = null;
  updateError = null; updates.length = 0;
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
    expect(await setRideStatus("r1", "en_route")).toEqual({ ok: true });
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
    const { driver } = await loadDriverById("d1");
    expect(driver?.id).toBe("d1");
  });

  it("combines first_name and last_name when there is no full_name column", async () => {
    singleResult = { user_id: "d1", first_name: "Ana", last_name: "Croes", status: "approved" };
    const { driver } = await loadDriverById("d1");
    expect(driver?.fullName).toBe("Ana Croes");
  });

  // The gate told a driver on bad hotel wifi that their account did not
  // exist, because an unreadable table and an absent row both came back
  // as null. They are different problems with different fixes.
  it("tells an unreadable drivers table apart from an account with no row", async () => {
    singleError = { message: "permission denied for table drivers" };
    expect(await loadDriverById("d1")).toEqual({
      driver: null, error: "permission denied for table drivers",
    });

    singleError = null;
    singleResult = null;
    expect(await loadDriverById("d1")).toEqual({ driver: null, error: null });
  });

  it("updates online status by user_id too", async () => {
    expect(await setOnline(true)).toBe(true);
    expect(calls.eq).toContainEqual(["user_id", "d1"]);
  });

  // The shell flips the switch before the write lands, so it needs to be
  // told when the write didn't. Reporting success either way is how a
  // driver sits out a shift reading "Online" over a row that says
  // otherwise.
  it("says when going online did not actually land", async () => {
    updateError = { message: "network" };
    expect(await setOnline(true)).toBe(false);
  });

  // The one profile field a driver owns. The policy in
  // docs/driver-schema.sql admits an update to their own row and blocks
  // only a change to status — so this writes phone and nothing else.
  it("saves the driver's own phone, and touches nothing else on the row", async () => {
    expect(await saveDriverPhone("+2975607336")).toEqual({ ok: true });
    expect(updates).toEqual([{ phone: "+2975607336" }]);
    expect(calls.eq).toContainEqual(["user_id", "d1"]);
  });

  it("carries the database's words back when the phone won't save", async () => {
    updateError = { message: "new row violates row-level security policy" };
    expect(await saveDriverPhone("+2975607336")).toEqual({
      ok: false, detail: "new row violates row-level security policy",
    });
  });

  // The inverse of claimRide. Narrow on purpose, and the database is the
  // authority: this only decides whether to OFFER the control, so the
  // portal never shows a button that is going to be refused.
  describe("handing a job back", () => {
    const job = (over: Record<string, unknown> = {}) => ({
      status: "driver_assigned",
      scheduledAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
      ...over,
    });

    it("offers it on a job that hasn't started and isn't imminent", () => {
      expect(canRelease(job())).toBe(true);
    });

    // Inside two hours a handback stops being scheduling and becomes a
    // no-show: another driver has to be found and briefed, which is a
    // phone call rather than a row update.
    it("does not offer it close to the pickup", () => {
      expect(canRelease(job({ scheduledAt: new Date(Date.now() + 30 * 60_000).toISOString() }))).toBe(false);
    });

    it("does not offer it once the job is running", () => {
      expect(canRelease(job({ status: "en_route" }))).toBe(false);
      expect(canRelease(job({ status: "arrived" }))).toBe(false);
    });

    it("sends the reason through, so dispatch isn't guessing", async () => {
      expect(await releaseRide("r1", "Car won't start")).toEqual({ ok: true });
      expect(calls.rpc[0]).toEqual(["release_ride", { p_ride_id: "r1", p_reason: "Car won't start" }]);
    });

    it("turns the database's refusal into something a driver can act on", async () => {
      rpcResult = { ok: false, error: "too_late" };
      const res = await releaseRide("r1", "x");
      expect(res).toEqual({ ok: false, detail: expect.stringMatching(/message cabby's/i) });
    });
  });

  // What a guest reads at a kerb, and whether there is anything to read.
  describe("the car a guest looks for", () => {
    const d = (over: Partial<DriverProfile> = {}): DriverProfile => ({
      id: "d1", fullName: "Ana Croes", email: null, phone: null,
      vehicle: null, plate: "A-42871",
      make: "Mercedes", model: "V-Class", colour: "Black", year: 2023,
      seats: 7, bags: 6, photoUrl: null,
      status: "approved", rating: null, tripsCount: 0, isOnline: false, ...over,
    });

    // Colour first: somebody scanning a kerb sees a colour before a badge.
    it("leads with the colour", () => {
      expect(vehicleLabel(d())).toBe("Black Mercedes V-Class");
    });

    // Nobody loses what they already had: rows that predate the
    // structured columns have one free-text line and it still answers.
    it("falls back to the single line an older row has", () => {
      expect(vehicleLabel(d({ make: null, model: null, colour: null, vehicle: "Toyota Hiace" })))
        .toBe("Toyota Hiace");
      expect(vehicleLabel(d({ make: null, model: null, colour: null, vehicle: null }))).toBe("");
    });

    // claim_ride writes what the drivers row holds. If it holds nothing,
    // the guest is back to watching an empty kerb — so the portal has to
    // know the difference before anybody is standing there.
    it("knows when there is nothing for a guest to look for", () => {
      expect(identifiable(d())).toBe(true);
      expect(identifiable(d({ plate: null }))).toBe(false);
      expect(identifiable(d({ plate: "   " }))).toBe(false);
      expect(identifiable(d({ make: null, model: null, colour: null, vehicle: null }))).toBe(false);
      expect(identifiable(d({ fullName: "" }))).toBe(false);
    });
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
      expect(job.fareAwg).toBe(6700);
      // and the driver is quoted their own cut of it, in dollars
      expect(job.payoutUsd).toBeCloseTo((6700 / 1.79) * 0.75, 2);
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
