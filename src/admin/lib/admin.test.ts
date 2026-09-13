import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: { from: string[]; rpc: [string, unknown][]; or: string[]; update: number } =
  { from: [], rpc: [], or: [], update: 0 };
let rpcResult: unknown = true;
let rpcError: { message: string } | null = null;
let rows: unknown[] = [];
let rowsError: { message: string } | null = null;

vi.mock("../../lib/supabase", () => {
  const builder = (table: string) => {
    calls.from.push(table);
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      in: chain,
      limit: () => Promise.resolve({ data: rowsError ? null : rows, error: rowsError }),
      or: (f: string) => { calls.or.push(f); return b; },
      // loadAllDrivers ends on .order(); loadUpcomingRides chains two and
      // then .limit(), so order has to be both thenable and chainable.
      order: () => {
        const p = Promise.resolve({ data: rowsError ? null : rows, error: rowsError });
        return Object.assign(p, b);
      },
      update: () => { calls.update++; return b; },
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
    },
  };
});

import {
  assignRide, checkIsAdmin, clashesFor, loadAllDrivers, loadUpcomingRides,
  needsDriver, setDriverStatus, type AdminRide,
} from "./admin";

const ride = (over: Partial<AdminRide> = {}): AdminRide => ({
  id: "r1", status: "confirmed", scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup: "A", dropoff: "B", vehicle: null, passengers: null, luggage: null,
  childSeats: null, fareAwg: null, bookingRef: null, guestName: null,
  guestPhone: null, flightNumber: null, driverId: null, driverName: null,
  driverVehicle: null, driverPlate: null, ...over,
});

beforeEach(() => {
  calls.from = []; calls.rpc = []; calls.or = []; calls.update = 0;
  rpcResult = true; rpcError = null; rows = []; rowsError = null;
});

describe("admin data layer", () => {
  // Three answers, not two. On a project where docs/admin-schema.sql has
  // not been run, is_admin() does not exist and the CALL errors — and
  // reporting that as "not an admin" would send the owner of the company
  // hunting a permission problem instead of running the migration.
  it("tells a refused admin check apart from a failed one", async () => {
    rpcResult = false;
    expect(await checkIsAdmin()).toEqual({ isAdmin: false, error: null });

    rpcError = { message: "function public.is_admin() does not exist" };
    const broken = await checkIsAdmin();
    expect(broken.isAdmin).toBe(false);
    expect(broken.error).toMatch(/is_admin\(\) does not exist/);
  });

  // "drivers: read as admin" is additive RLS. Without it the select
  // succeeds and returns nothing, so an operator told "no drivers" would
  // go and re-create people who are already there.
  it("reports an unreadable drivers table rather than an empty one", async () => {
    rowsError = { message: "permission denied for table drivers" };
    const res = await loadAllDrivers();
    expect(res.drivers).toEqual([]);
    expect(res.error).toBe("permission denied for table drivers");
  });

  // drivers.id is the row's own key; drivers.user_id points at
  // auth.users. rides.driver_id and both admin RPCs key on the auth id,
  // so a list built on the wrong one produces assignments that abort on
  // a foreign key — which is how this project once shipped an Accept
  // button that did nothing at all.
  it("keys a driver by their auth id, not by the drivers row's own key", async () => {
    rows = [{ id: "row-7", user_id: "auth-1", first_name: "Ana", last_name: "Croes", status: "approved" }];
    const { drivers } = await loadAllDrivers();
    expect(drivers[0].id).toBe("auth-1");
    expect(drivers[0].fullName).toBe("Ana Croes");
  });

  // bookingPayload.ts inserts in three tiers, so scheduled_at only
  // exists on rows whose later tier succeeded. Filtering on it would
  // silently drop every ride booked through the narrow path.
  it("selects the board on scheduled_date, and keeps undated rides on it", async () => {
    await loadUpcomingRides();
    expect(calls.from).toContain("rides");
    expect(calls.or[0]).toMatch(/^scheduled_date\.gte\.\d{4}-\d{2}-\d{2},scheduled_date\.is\.null$/);
  });

  it("reports an unreadable board rather than a quiet day", async () => {
    rowsError = { message: "permission denied for table rides" };
    const res = await loadUpcomingRides();
    expect(res.rides).toEqual([]);
    expect(res.error).toBe("permission denied for table rides");
  });

  // RLS has no column list, so an update policy loose enough to set
  // drivers.status would also let the same request set fare_total. The
  // function signature is the column list — which is only true if the
  // client never reaches for an update.
  it("changes a driver's status through the RPC and never through an update", async () => {
    rpcResult = { ok: true, held_rides: 2 };
    const res = await setDriverStatus("auth-1", "suspended");
    expect(res).toEqual({ ok: true, heldRides: 2 });
    expect(calls.rpc[0][0]).toBe("admin_set_driver_status");
    expect(calls.update).toBe(0);
  });

  it("assigns through the RPC and never through an update", async () => {
    rpcResult = { ok: true, driver_name: "Ana Croes", driver_vehicle: "Black Mercedes V-Class", driver_plate: "A-12345" };
    const res = await assignRide("r1", "auth-1");
    expect(res).toEqual({ ok: true, stamped: { name: "Ana Croes", vehicle: "Black Mercedes V-Class", plate: "A-12345" } });
    expect(calls.rpc[0][0]).toBe("admin_assign_ride");
    expect(calls.update).toBe(0);
  });

  // A refusal with no words is indistinguishable from a dead button, and
  // these two buttons are the ones replacing a SQL prompt.
  it("turns every refusal into a sentence that names the next move", async () => {
    rpcResult = { ok: false, error: "driver_not_approved" };
    const refused = await assignRide("r1", "auth-1");
    expect(refused).toEqual({ ok: false, detail: expect.stringMatching(/isn't approved/i) });

    rpcResult = { ok: false, error: "already_taken" };
    const taken = await assignRide("r1", "auth-1");
    expect(taken).toEqual({ ok: false, detail: expect.stringMatching(/claimed it from the pool/i) });

    // an error the reason table has never seen still reaches the screen
    rpcResult = { ok: false, error: "something_new" };
    expect(await assignRide("r1", "auth-1")).toEqual({ ok: false, detail: "something_new" });
  });

  // The one thing the Assign screen may offer, matching exactly what
  // admin_assign_ride's where clause will accept.
  it("counts a ride as needing a driver only when the database would accept one", () => {
    expect(needsDriver(ride())).toBe(true);
    expect(needsDriver(ride({ status: "pending" }))).toBe(true);
    expect(needsDriver(ride({ driverId: "d1", status: "driver_assigned" }))).toBe(false);
    expect(needsDriver(ride({ status: "cancelled" }))).toBe(false);
    expect(needsDriver(ride({ status: "completed" }))).toBe(false);
  });

  // A warning, not a rule — but one an operator should never have to
  // spot by reading two lists side by side.
  it("spots a driver already booked within the clash window, and ignores closed rides", () => {
    const target = "2026-09-01T19:00:00.000Z";
    const board = [
      ride({ id: "near", driverId: "d1", status: "driver_assigned", scheduledAt: "2026-09-01T18:35:00.000Z" }),
      ride({ id: "far", driverId: "d1", status: "driver_assigned", scheduledAt: "2026-09-01T23:00:00.000Z" }),
      ride({ id: "off", driverId: "d1", status: "cancelled", scheduledAt: target }),
      ride({ id: "other", driverId: "d2", status: "driver_assigned", scheduledAt: target }),
    ];
    expect(clashesFor("d1", target, board).map((r) => r.id)).toEqual(["near"]);
    // an undated ride cannot clash with anything, and must not be claimed to
    expect(clashesFor("d1", null, board)).toEqual([]);
  });
});
