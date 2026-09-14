import { describe, it, expect } from "vitest";
import { attentionItems, collisions, currentRide } from "./attention";
import { makeDriver, makeRide } from "./fixtures";

/** A fixed minute, so "in forty minutes" means the same thing on every
    run. Every ride below is positioned relative to this. */
const NOW = Date.parse("2026-09-01T18:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe("what needs a person", () => {
  // The only row on a dispatch board that will not resolve itself. An
  // assigned ride runs, a cancelled one is over, and an unassigned one
  // just gets closer to its pickup time.
  it("raises an unassigned ride, and raises it harder as the pickup closes", () => {
    const soon = attentionItems([makeRide({ id: "a", scheduledAt: at(40) })], [], NOW);
    const later = attentionItems([makeRide({ id: "b", scheduledAt: at(600) })], [], NOW);
    expect(soon[0].kind).toBe("unassigned");
    expect(soon[0].severity).toBe("now");
    expect(later[0].severity).toBe("soon");
  });

  // Past the horizon the pool is doing its job and this is not news.
  // An inbox that lists next week is an inbox nobody reads.
  it("leaves an unassigned ride days away off the list", () => {
    const items = attentionItems([makeRide({ scheduledAt: at(60 * 48) })], [], NOW);
    expect(items).toEqual([]);
  });

  // A ride handed back is not the same story as one nobody has claimed
  // yet: somebody already looked at it and said no.
  it("tells a handed-back ride apart from one nobody has claimed", () => {
    const items = attentionItems(
      [makeRide({ scheduledAt: at(120), notes: "2 bags · Returned to pool: Car won't start" })],
      [], NOW,
    );
    expect(items[0].kind).toBe("handed-back");
    expect(items[0].headline).toMatch(/handed back/i);
  });

  // The one item where a guest is already standing somewhere.
  it("raises a driver who never set off, once the pickup time has passed", () => {
    const items = attentionItems(
      [makeRide({ status: "driver_assigned", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-1", scheduledAt: at(-45) })],
      [], NOW,
    );
    expect(items[0].kind).toBe("not-under-way");
    expect(items[0].severity).toBe("now");
    expect(items[0].headline).toMatch(/Ana Croes hasn't set off/);
  });

  // Ten minutes past may simply be a driver who hasn't tapped anything.
  it("does not call a driver late the minute the clock passes", () => {
    const items = attentionItems(
      [makeRide({ status: "driver_assigned", driverId: "d1", driverPlate: "A-1", scheduledAt: at(-5) })],
      [], NOW,
    );
    expect(items).toEqual([]);
  });

  // The exact bug claim_ride() was fixed for, seen from the operator's
  // side: a ride can have a driver and still show the guest nothing.
  it("raises an assigned ride whose guest has no car to look for", () => {
    const items = attentionItems(
      [makeRide({ status: "driver_assigned", driverId: "d1", driverName: "Ana Croes", scheduledAt: at(300) })],
      [], NOW,
    );
    expect(items[0].kind).toBe("no-car-shown");
    expect(items[0].detail).toMatch(/no plate and no vehicle/);
  });

  // One problem, one row. A ride that is both unassigned and close is
  // not two jobs competing for the same tap.
  it("never lists one ride twice", () => {
    const items = attentionItems(
      [makeRide({ id: "a", scheduledAt: at(30), notes: "Returned to pool: no answer" })],
      [], NOW,
    );
    expect(items.filter((i) => i.rideId === "a")).toHaveLength(1);
  });

  // admin_cancel_ride moves a row and does not touch Stripe. This is the
  // only place anybody is told the card is still holding.
  it("keeps chasing a cancelled booking that still has money against it", () => {
    const items = attentionItems(
      [makeRide({ status: "cancelled", paymentStatus: "authorized", scheduledAt: at(-600) })],
      [], NOW,
    );
    expect(items[0].kind).toBe("money-outstanding");
    expect(items[0].detail).toMatch(/Void the authorisation in Stripe/);
  });

  it("says nothing about a cancelled booking with no money on it", () => {
    const items = attentionItems([makeRide({ status: "cancelled", scheduledAt: at(-600) })], [], NOW);
    expect(items).toEqual([]);
  });

  // Suspending a driver deliberately does not strip their work — but
  // somebody has to decide about each ride they still hold.
  it("raises a suspended driver who is still holding live work", () => {
    const items = attentionItems(
      [makeRide({ status: "driver_assigned", driverId: "d1", driverPlate: "A-1", scheduledAt: at(600) })],
      [makeDriver({ id: "d1", status: "suspended" })],
      NOW,
    );
    expect(items.some((i) => i.kind === "suspended-holding")).toBe(true);
  });

  // The house rule, in the one place a violation would be invisible:
  // "no drivers are suspended" and "the drivers table could not be read"
  // are the same empty array, and only one of them is an all-clear.
  it("withholds the driver-derived items when the drivers table could not be read", () => {
    const rides = [makeRide({ status: "driver_assigned", driverId: "d1", driverPlate: "A-1", scheduledAt: at(600) })];
    expect(attentionItems(rides, null, NOW).some((i) => i.kind === "suspended-holding")).toBe(false);
    expect(attentionItems(rides, [], NOW).some((i) => i.kind === "waiting-approval")).toBe(false);
  });

  // Worst first, then soonest. An operator works down this list.
  it("sorts by how urgent, then by how soon", () => {
    const items = attentionItems(
      [
        makeRide({ id: "later", scheduledAt: at(600) }),
        makeRide({ id: "now", scheduledAt: at(20) }),
        makeRide({ id: "sooner", scheduledAt: at(300) }),
      ],
      [], NOW,
    );
    expect(items.map((i) => i.rideId)).toEqual(["now", "sooner", "later"]);
  });

  // A booking with no time sorts to the end of every other list and is
  // invisible to the pool, so it outranks a ride that is merely close.
  it("puts a booking with no date on it at the top", () => {
    const items = attentionItems(
      [makeRide({ id: "dated", scheduledAt: at(300) }), makeRide({ id: "broken", scheduledAt: null })],
      [], NOW,
    );
    expect(items[0].kind).toBe("no-time");
    expect(items[0].severity).toBe("now");
  });
});

describe("collisions", () => {
  // The database will happily put one driver on two airport runs forty
  // minutes apart. Sometimes that is right. What is never right is
  // nobody noticing.
  it("marks BOTH halves of a double booking, not just the later one", () => {
    const a = makeRide({ id: "a", driverId: "d1", status: "driver_assigned", scheduledAt: at(0) });
    const b = makeRide({ id: "b", driverId: "d1", status: "driver_assigned", scheduledAt: at(40) });
    const found = collisions([a, b]);
    expect(found.get("a")).toHaveLength(1);
    expect(found.get("b")).toHaveLength(1);
  });

  it("is not troubled by two rides on two different drivers", () => {
    const a = makeRide({ id: "a", driverId: "d1", status: "driver_assigned", scheduledAt: at(0) });
    const b = makeRide({ id: "b", driverId: "d2", status: "driver_assigned", scheduledAt: at(10) });
    expect(collisions([a, b]).size).toBe(0);
  });

  // A cancelled ride is not a commitment, so it cannot clash with one.
  it("ignores rides that are already over", () => {
    const a = makeRide({ id: "a", driverId: "d1", status: "driver_assigned", scheduledAt: at(0) });
    const b = makeRide({ id: "b", driverId: "d1", status: "cancelled", scheduledAt: at(20) });
    expect(collisions([a, b]).size).toBe(0);
  });
});

describe("what a driver is doing", () => {
  it("prefers the ride they are actually on to the one coming next", () => {
    const live = makeRide({ id: "live", driverId: "d1", status: "en_route", scheduledAt: at(-10) });
    const next = makeRide({ id: "next", driverId: "d1", status: "driver_assigned", scheduledAt: at(120) });
    expect(currentRide("d1", [next, live])?.id).toBe("live");
  });

  it("falls back to their soonest booked job", () => {
    const later = makeRide({ id: "later", driverId: "d1", status: "driver_assigned", scheduledAt: at(400) });
    const soon = makeRide({ id: "soon", driverId: "d1", status: "driver_assigned", scheduledAt: at(120) });
    expect(currentRide("d1", [later, soon])?.id).toBe("soon");
  });

  it("answers null for a driver with nothing on", () => {
    expect(currentRide("d9", [makeRide({ driverId: "d1", status: "en_route" })])).toBeNull();
  });
});
