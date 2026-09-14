import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: {
  from: string[]; rpc: [string, unknown][]; or: string[]; update: number;
  /** which bucket a signature was asked of, and for how long */
  signed: [string, string, number][];
} = { from: [], rpc: [], or: [], update: 0, signed: [] };
let rpcResult: unknown = true;
let rpcError: { message: string } | null = null;
let rows: unknown[] = [];
let rowsError: { message: string } | null = null;
let signedUrl: string | null = "https://example.test/signed?token=abc";
let signedError: { message: string } | null = null;

vi.mock("../../lib/supabase", () => {
  const builder = (table: string) => {
    calls.from.push(table);
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      // loadAllDriverDocuments ends on .select(); everything else chains
      // past it, so select has to be both thenable and chainable.
      select: () => {
        const p = Promise.resolve({ data: rowsError ? null : rows, error: rowsError });
        return Object.assign(p, b);
      },
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
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: (path: string, seconds: number) => {
            calls.signed.push([bucket, path, seconds]);
            return Promise.resolve({
              data: signedError ? null : { signedUrl },
              error: signedError,
            });
          },
        }),
      },
    },
  };
});

import {
  assignRide, checkIsAdmin, clashesFor, loadAllDrivers, loadAllDriverDocuments,
  loadUpcomingRides, needsDriver, reviewDocument, setDriverStatus,
  signedDocumentUrl, DOCUMENT_LINK_SECONDS, type AdminRide,
} from "./admin";

const ride = (over: Partial<AdminRide> = {}): AdminRide => ({
  id: "r1", status: "confirmed", scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup: "A", dropoff: "B", vehicle: null, passengers: null, luggage: null,
  childSeats: null, fareAwg: null, bookingRef: null, guestName: null,
  guestPhone: null, flightNumber: null, driverId: null, driverName: null,
  driverVehicle: null, driverPlate: null, ...over,
});

beforeEach(() => {
  calls.from = []; calls.rpc = []; calls.or = []; calls.update = 0; calls.signed = [];
  rpcResult = true; rpcError = null; rows = []; rowsError = null;
  signedUrl = "https://example.test/signed?token=abc"; signedError = null;
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
  // v2. A drivers row with no user_id is one no write path can address:
  // the RPC matches on user_id, claim_ride stamps auth.uid(). Sent
  // anyway it reaches Postgres as an invalid uuid and comes back as a
  // cast error, which says nothing about the actual gap.
  it("refuses a driver with no account rather than sending an empty id", async () => {
    const res = await setDriverStatus("", "approved");
    expect(res.ok).toBe(false);
    expect(calls.rpc.length).toBe(0);
    if (!res.ok) expect(res.detail).toMatch(/no account linked/i);
  });

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

describe("driver documents, from the board", () => {
  // One query, not one per row. Thirty drivers is thirty chances for
  // some to fail while the rest succeed — a board where four rows say
  // "3 of 5" and one says nothing for no reason an operator can see.
  it("reads every driver's documents in a single query", async () => {
    rows = [
      { driver_user_id: "d1", slug: "drivers-licence", path: "d1/drivers-licence.pdf", status: "accepted" },
      { driver_user_id: "d1", slug: "id-or-passport", path: "d1/id-or-passport.pdf", status: "uploaded" },
      { driver_user_id: "d2", slug: "drivers-licence", path: "d2/drivers-licence.pdf", status: "rejected", reason: "Cut off" },
    ];
    const { byDriver, error } = await loadAllDriverDocuments();
    expect(error).toBeNull();
    expect(calls.from.filter((t) => t === "driver_documents")).toHaveLength(1);
    expect(byDriver.get("d1")).toHaveLength(2);
    expect(byDriver.get("d2")?.[0].reason).toBe("Cut off");
  });

  // The fault this project keeps catching. An operator told "nobody has
  // sent anything" over a table nobody could read goes and asks five
  // drivers to re-send documents that are already on file.
  it("reports an unreadable documents table instead of an empty board", async () => {
    rowsError = { message: "permission denied for table driver_documents" };
    const { byDriver, error } = await loadAllDriverDocuments();
    expect(byDriver.size).toBe(0);
    expect(error).toBe("permission denied for table driver_documents");
  });

  // The whole reason driver-docs is private. getPublicUrl would hand
  // back a permanent, forwardable URL to somebody's passport.
  it("serves a document as a short-lived signature on the private bucket", async () => {
    const res = await signedDocumentUrl("d1/id-or-passport.pdf");
    expect(res).toEqual({ ok: true, url: "https://example.test/signed?token=abc" });
    expect(calls.signed).toEqual([["driver-docs", "d1/id-or-passport.pdf", DOCUMENT_LINK_SECONDS]]);
    expect(DOCUMENT_LINK_SECONDS).toBeLessThanOrEqual(60);
  });

  // A View button that silently does nothing sends an operator looking
  // for a corrupt file instead of a missing migration.
  it("says why a document could not be opened rather than handing back no link", async () => {
    signedError = { message: "Object not found" };
    const res = await signedDocumentUrl("d1/id-or-passport.pdf");
    expect(res).toEqual({ ok: false, detail: "Object not found" });
  });

  it("sends the review through the RPC, pinned to the copy that was read", async () => {
    rpcResult = { ok: true, accepted_count: 3, driver_status: "pending" };
    const res = await reviewDocument("d1", "vehicle-insurance", "rejected", "Expired in June.", "2026-09-10T14:00:00.000Z");
    expect(res).toEqual({ ok: true, acceptedCount: 3, driverStatus: "pending" });
    expect(calls.rpc[0][0]).toBe("admin_review_document");
    expect(calls.rpc[0][1]).toEqual({
      p_driver_user_id: "d1",
      p_slug: "vehicle-insurance",
      p_status: "rejected",
      p_reason: "Expired in June.",
      p_seen_at: "2026-09-10T14:00:00.000Z",
    });
  });

  // Accepting documents is not approving a driver. The status comes back
  // unchanged so the board can say "all five in — they still need
  // approving on the row above" rather than implying it happened.
  it("hands back the driver's status untouched", async () => {
    rpcResult = { ok: true, accepted_count: 5, driver_status: "pending" };
    const res = await reviewDocument("d1", "drivers-licence", "accepted", null, null);
    expect(res).toEqual({ ok: true, acceptedCount: 5, driverStatus: "pending" });
  });

  // The likeliest minute for a driver to re-upload is the one right
  // after a rejection told them to. An Accept that lands on a file
  // nobody opened is the outcome the whole panel exists to prevent.
  it("turns a stale review into a sentence about the new copy", async () => {
    rpcResult = { ok: false, error: "moved_on" };
    const res = await reviewDocument("d1", "drivers-licence", "accepted", null, "2026-09-01T00:00:00.000Z");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.detail).toMatch(/uploaded a new copy/i);
  });

  // The requirement the whole feature turns on: a driver told "not
  // accepted" with no sentence attached has no move but messaging
  // somebody, which is the process being replaced.
  it("passes the database's refusal of a reasonless rejection through in words", async () => {
    rpcResult = { ok: false, error: "need_reason" };
    const res = await reviewDocument("d1", "drivers-licence", "rejected", null, null);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.detail).toMatch(/say what's wrong/i);
  });

  // A matched row is not a moved value — the lesson admin_set_driver_status
  // already learned the hard way against the drivers_protect trigger.
  it("does not report a write that the database put back as a success", async () => {
    rpcResult = { ok: false, error: "not_applied", status: "uploaded" };
    const res = await reviewDocument("d1", "drivers-licence", "accepted", null, null);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.detail).toMatch(/didn't move/i);
  });
});
