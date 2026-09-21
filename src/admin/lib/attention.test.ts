import { describe, it, expect } from "vitest";
import { attentionItems, collisions, currentRide } from "./attention";
import { makeDriver, makeRide } from "./fixtures";
import type { FlightStatus } from "../../lib/flightStatus";

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

// ── flights ───────────────────────────────────────────────────────────
//
// On the driver's screen a delay is information and on the guest's card
// it is reassurance. Here it is WORK: a cancelled arrival is a ride to
// unassign, a driver to release and a guest to phone. Every test below
// is really asking the same question — is there a job attached to this,
// and does the sentence say what it is.

const flight = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL765", alsoKnownAs: [], scheduled: at(90),
  estimated: null, predicted: null, actual: null, state: "scheduled",
  terminal: null, aircraft: null, airline: "KLM", live: true, ...over,
});

/** One ride, one answer about its flight. */
const knowing = (rideId: string, f: FlightStatus) => new Map([[rideId, f]]);

/** An airport arrival with somebody driving it and a car on record, so
    nothing else on the list has anything to say about it. */
const assigned = (over = {}) => makeRide({
  id: "r1", status: "driver_assigned", driverId: "d1", driverName: "Ana Croes",
  driverPlate: "A-1", driverVehicle: "V-Class", flightNumber: "KL765", ...over,
});

describe("a flight that is not coming", () => {
  it("names the ride, the driver and the two things to do", () => {
    const r = assigned({ scheduledAt: at(180) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ state: "cancelled" })));
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("flight-cancelled");
    expect(items[0].severity).toBe("now");
    expect(items[0].rideId).toBe("r1");
    expect(items[0].headline).toMatch(/KL765 is cancelled/);
    expect(items[0].detail).toMatch(/Take Ana Croes off the ride and call the guest/);
  });

  // The whole reason this is checked before the unassigned block. A
  // board that says "put a driver on" about a flight cancelled last
  // night is worse than a board that says nothing.
  it("never tells an operator to staff a ride whose flight is cancelled", () => {
    const r = makeRide({ id: "r1", flightNumber: "KL765", scheduledAt: at(40) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ state: "cancelled" })));
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("flight-cancelled");
    expect(items[0].detail).toMatch(/Call the guest before anybody is put on it/);
    expect(items[0].detail).not.toMatch(/put a driver on/i);
  });

  // A driver already on the road to a plane that does not exist is
  // exactly who needs turning round, so this one is not gated on the
  // ride still being at home.
  it("still speaks up once the driver has set off", () => {
    const r = assigned({ status: "en_route", scheduledAt: at(20) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ state: "cancelled" })));
    expect(items[0].kind).toBe("flight-cancelled");
  });

  // Diverted is not cancelled: the guest usually still arrives, late and
  // from somewhere else, so the advice is the opposite way round.
  it("tells a diversion apart, and says not to release the driver yet", () => {
    const r = assigned({ scheduledAt: at(180) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ state: "diverted" })));
    expect(items[0].kind).toBe("flight-diverted");
    expect(items[0].severity).toBe("now");
    expect(items[0].detail).toMatch(/Call the guest first and leave Ana Croes on it/);
  });

  // Derived, never stored: the item goes when the thing it is about is
  // dealt with, and calling the booking off is dealing with it.
  it("goes away once the operator has cancelled the booking", () => {
    const r = assigned({ status: "cancelled", scheduledAt: at(180) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ state: "cancelled" })));
    expect(items).toEqual([]);
  });
});

describe("a flight that moved", () => {
  it("raises a long delay against a driver who is booked to collect", () => {
    const r = assigned({ scheduledAt: at(120) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ estimated: at(180) })));
    expect(items[0].kind).toBe("flight-late");
    expect(items[0].headline).toMatch(/running 1h 30m late/);
    expect(items[0].detail).toMatch(/Move the pickup time or tell them to hold/);
  });

  // Urgent only when the driver is about to leave for a plane that is
  // not there — the same ninety minutes the rest of this board calls
  // imminent.
  it("grades the delay by how close the driver is to setting off", () => {
    const f = flight({ estimated: at(180) });
    const soon = attentionItems([assigned({ scheduledAt: at(80) })], [], NOW, knowing("r1", f));
    const later = attentionItems([assigned({ scheduledAt: at(300) })], [], NOW, knowing("r1", f));
    expect(soon[0].severity).toBe("now");
    expect(later[0].severity).toBe("soon");
  });

  // Under three quarters of an hour nobody decides anything: the driver
  // waits at the kerb, which is what an airport pickup already is. The
  // driver's own screen carries it from fifteen minutes.
  it("says nothing about a delay a driver simply waits out", () => {
    const r = assigned({ scheduledAt: at(120) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ estimated: at(120) })));
    expect(items).toEqual([]);
  });

  // The easy one to forget, and the expensive one: a guest waiting in
  // an arrivals hall is not the same cost as a driver waiting in a car,
  // which is why the threshold is tighter than the delay's.
  it("raises an early arrival, and makes it urgent once the plane is nearly down", () => {
    const near = attentionItems(
      [assigned({ scheduledAt: at(120) })], [], NOW, knowing("r1", flight({ estimated: at(45) })),
    );
    expect(near[0].kind).toBe("flight-early");
    expect(near[0].severity).toBe("now");
    expect(near[0].headline).toMatch(/lands 45 min early/);
    expect(near[0].detail).toMatch(/they will be at the kerb first/);

    const far = attentionItems(
      [assigned({ id: "r1", scheduledAt: at(300) })], [], NOW,
      knowing("r1", flight({ scheduled: at(270), estimated: at(210) })),
    );
    expect(far[0].severity).toBe("soon");
  });

  it("says so plainly when the plane is already on the ground", () => {
    const items = attentionItems(
      [assigned({ scheduledAt: at(120) })], [], NOW,
      knowing("r1", flight({ actual: at(-5) })),
    );
    expect(items[0].kind).toBe("flight-early");
    expect(items[0].detail).toMatch(/already on the ground/);
  });

  it("says nothing about twenty minutes early", () => {
    const items = attentionItems(
      [assigned({ scheduledAt: at(120) })], [], NOW, knowing("r1", flight({ estimated: at(70) })),
    );
    expect(items).toEqual([]);
  });

  // The false alarm this ordering exists to prevent: a driver sitting
  // still through a two-hour delay is a driver doing the right thing,
  // and "call them, they haven't set off" is what teaches an operator
  // to stop reading the list.
  it("does not call a driver late when it is the flight that is late", () => {
    const r = assigned({ scheduledAt: at(-45) });
    const items = attentionItems(
      [r], [], NOW, knowing("r1", flight({ scheduled: at(-75), estimated: at(45) })),
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("flight-late");
    expect(items.some((i) => i.kind === "not-under-way")).toBe(false);
  });

  // Staffing the ride is the bigger job and is still the right one: the
  // ride has to happen, just later. A delay only buys time for it.
  it("leaves an unstaffed ride's own item alone", () => {
    const r = makeRide({ id: "r1", flightNumber: "KL765", scheduledAt: at(40) });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ estimated: at(180) })));
    expect(items[0].kind).toBe("unassigned");
  });

  it("never lists one ride twice, whatever its flight did", () => {
    const r = assigned({ scheduledAt: at(120), driverPlate: null, driverVehicle: null });
    const items = attentionItems([r], [], NOW, knowing("r1", flight({ estimated: at(180) })));
    expect(items.filter((i) => i.rideId === "r1")).toHaveLength(1);
  });
});

describe("when nothing is known about any flight", () => {
  // The ordinary case and it will stay the ordinary case: no key set, no
  // row written yet, a mistyped number, the month's budget gone. The
  // board has to look exactly as it did before this existed.
  it("adds nothing at all, and does not change what was already there", () => {
    const rides = [
      assigned({ id: "r1", scheduledAt: at(120) }),
      makeRide({ id: "r2", flightNumber: "KL765", scheduledAt: at(40) }),
    ];
    const silent = attentionItems(rides, [], NOW);
    const empty = attentionItems(rides, [], NOW, new Map());
    expect(silent.map((i) => i.kind)).toEqual(["unassigned"]);
    expect(empty).toEqual(silent);
    expect(silent.some((i) => i.kind.startsWith("flight-"))).toBe(false);
  });
});
