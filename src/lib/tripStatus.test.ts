import { describe, it, expect } from "vitest";
import {
  tripState, canCancel, showsDriver, canContactDriver, paymentState, vehicleName,
  formatUsd, STATUS_LABEL, CLOSE_GRACE_HOURS, type TripRow,
} from "./tripStatus";

const H = 3_600_000;
const NOW = Date.parse("2026-09-23T16:00:00Z"); // noon in Aruba

/** A ride as the booking flow writes it: Aruba wall clock, no instant. */
const ride = (hoursFromNow: number, over: Partial<TripRow> = {}): TripRow => {
  const at = new Date(NOW + hoursFromNow * H - 4 * H); // to Aruba wall clock
  return {
    status: "confirmed",
    scheduled_date: at.toISOString().slice(0, 10),
    scheduled_time: at.toISOString().slice(11, 16),
    ...over,
  };
};

describe("one status per trip", () => {
  it("reads each backend word into the status it means", () => {
    const cases: [string, string][] = [
      ["pending", "received"], ["pending_payment", "received"], ["requested", "received"],
      ["confirmed", "confirmed"], ["accepted", "confirmed"], ["paid", "confirmed"],
      ["driver_assigned", "driver_assigned"], ["assigned", "driver_assigned"],
      ["en_route", "en_route"], ["arrived", "arrived"],
      ["in_progress", "onboard"], ["on_board", "onboard"],
      ["completed", "completed"], ["cancelled", "cancelled"], ["canceled", "cancelled"],
      ["no_show", "no_show"],
    ];
    for (const [raw, want] of cases) {
      expect(tripState(ride(24, { status: raw }), NOW).status, raw).toBe(want);
    }
  });

  it("never guesses at a word it does not know", () => {
    const s = tripState(ride(24, { status: "limbo" }), NOW);
    expect(s.status).toBe("needs_review");
    expect(s.placement).toBe("review");
  });

  it("gives every status a label", () => {
    for (const label of Object.values(STATUS_LABEL)) expect(label.length).toBeGreaterThan(0);
  });
});

// The contradiction this redesign exists to remove: a trip filed as over
// while its badge says a driver is on the way.
describe("a trip whose pickup time has gone by", () => {
  it("can never be 'Driver assigned' once it is past the grace window", () => {
    const s = tripState(ride(-(CLOSE_GRACE_HOURS + 1), { status: "driver_assigned" }), NOW);
    expect(s.status).toBe("needs_review");
    expect(s.placement).toBe("review");
    expect(s.reviewReason).toMatch(/never marked complete or cancelled/);
  });

  it("is never filed under Past unless it actually finished", () => {
    for (const raw of ["pending", "confirmed", "driver_assigned", "en_route", "arrived", "in_progress"]) {
      const s = tripState(ride(-72, { status: raw }), NOW);
      expect(s.placement, raw).not.toBe("past");
      expect(s.status, raw).toBe("needs_review");
    }
  });

  // The FAQ promises a driver still waits for a flight three hours late,
  // and the booking's pickup time does not move with the flight.
  it("stays live inside the grace window, for the delayed flight", () => {
    const s = tripState(ride(-3, { status: "driver_assigned" }), NOW);
    expect(s.status).toBe("driver_assigned");
    expect(s.placement).toBe("upcoming");
  });

  it("files a finished trip under Past and a cancelled one under Cancelled, never both", () => {
    expect(tripState(ride(-72, { status: "completed" }), NOW).placement).toBe("past");
    expect(tripState(ride(-72, { status: "cancelled" }), NOW).placement).toBe("cancelled");
    expect(tripState(ride(72, { status: "cancelled" }), NOW).placement).toBe("cancelled");
  });

  it("files a no-show under Past, if a writer ever records one", () => {
    expect(tripState(ride(-72, { status: "no_show" }), NOW).placement).toBe("past");
  });
});

describe("when a trip is active", () => {
  it("is active while the driver is moving", () => {
    for (const raw of ["en_route", "arrived", "in_progress"]) {
      expect(tripState(ride(0.5, { status: raw }), NOW).active, raw).toBe(true);
    }
  });

  it("is active once an assigned trip is close", () => {
    expect(tripState(ride(1, { status: "driver_assigned" }), NOW).active).toBe(true);
    expect(tripState(ride(30, { status: "driver_assigned" }), NOW).active).toBe(false);
  });
});

describe("what a guest may do", () => {
  // Mirrors cancel_my_ride in docs/cancel-schema.sql. Anything outside it
  // is a control the database would refuse.
  it("offers cancel only on statuses the database lets a guest cancel", () => {
    for (const raw of ["pending", "pending_payment", "confirmed", "driver_assigned"]) {
      const r = ride(48, { status: raw });
      expect(canCancel(r, tripState(r, NOW), NOW), raw).toBe(true);
    }
    for (const raw of ["accepted", "paid", "assigned", "en_route", "arrived", "in_progress", "completed", "cancelled"]) {
      const r = ride(48, { status: raw });
      expect(canCancel(r, tripState(r, NOW), NOW), raw).toBe(false);
    }
  });

  it("does not offer cancel once the pickup time has passed", () => {
    const r = ride(-1, { status: "confirmed" });
    expect(canCancel(r, tripState(r, NOW), NOW)).toBe(false);
  });

  it("shows the driver only while one is on the trip", () => {
    const on = ride(24, { status: "driver_assigned", driver_name: "Ana" });
    expect(showsDriver(on, tripState(on, NOW))).toBe(true);
    const done = ride(-24, { status: "completed", driver_name: "Ana" });
    expect(showsDriver(done, tripState(done, NOW))).toBe(false);
  });

  it("shows the driver's phone only while the trip is active", () => {
    const later = ride(30, { status: "driver_assigned", driver_name: "Ana", driver_phone: "+2975551234" });
    expect(canContactDriver(later, tripState(later, NOW))).toBe(false);
    const now = ride(1, { status: "driver_assigned", driver_name: "Ana", driver_phone: "+2975551234" });
    expect(canContactDriver(now, tripState(now, NOW))).toBe(true);
  });
});

describe("payment", () => {
  it("reads the three words the webhook writes", () => {
    expect(paymentState({ payment_status: "paid" })).toBe("paid");
    expect(paymentState({ payment_status: "authorized" })).toBe("pending");
    expect(paymentState({ payment_status: "failed" })).toBe("failed");
  });

  // Empty is the normal case while card payment is off. Calling it
  // "pending" would tell every guest they owe money.
  it("treats no payment record as paying the driver, not as unpaid", () => {
    expect(paymentState({ payment_status: null })).toBe("with_driver");
    expect(paymentState({})).toBe("with_driver");
  });

  it("recognises refunded without anything having to write it", () => {
    expect(paymentState({ payment_status: "refunded" })).toBe("refunded");
  });

  it("does not guess at an unknown word", () => {
    expect(paymentState({ payment_status: "partially_captured" })).toBe("unknown");
  });
});

describe("display", () => {
  it("names the vehicle instead of printing its id twice", () => {
    expect(vehicleName({ vehicle_class: "transit", vehicle_type: "transit" })).toBe("Premium Van");
    expect(vehicleName({ vehicle_type: "suv" })).toBe("Luxury SUV");
    expect(vehicleName({})).toBeNull();
  });

  it("labels dollars as dollars", () => {
    expect(formatUsd(64.4)).toBe("US$64");
  });
});
