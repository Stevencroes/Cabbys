import { describe, it, expect } from "vitest";
import { customerKey, customersFrom, matchesCustomer } from "./customers";
import { makeRide } from "./fixtures";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");
const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

describe("guests, assembled out of their bookings", () => {
  // The account is the only key here that cannot be a typo — and it
  // exists even for a guest who never signed up, because the booking
  // flow gives every checkout an anonymous auth user.
  it("groups by the account before anything typed into a form", () => {
    const people = customersFrom([
      makeRide({ id: "a", passengerId: "u1", guestName: "M. Vos", guestEmail: "m@vos.test" }),
      makeRide({ id: "b", passengerId: "u1", guestName: "Marta Vos", guestEmail: "marta@vos.test" }),
    ], NOW);
    expect(people).toHaveLength(1);
    expect(people[0].keyKind).toBe("account");
    expect(people[0].bookings).toBe(2);
  });

  it("falls back to the email, then the number, then the name", () => {
    expect(customerKey(makeRide({ passengerId: null, guestEmail: "A@B.test" }))?.kind).toBe("email");
    expect(customerKey(makeRide({ passengerId: null, guestEmail: null }))?.kind).toBe("phone");
    expect(customerKey(makeRide({ passengerId: null, guestEmail: null, guestPhone: null }))?.kind).toBe("name");
  });

  // "+297 560 7336" and "2975607336" are one person, and an email typed
  // in capitals is the same address.
  it("does not split one person over how they typed their own details", () => {
    const people = customersFrom([
      makeRide({ id: "a", passengerId: null, guestEmail: null, guestPhone: "+297 560 7336" }),
      makeRide({ id: "b", passengerId: null, guestEmail: null, guestPhone: "2975607336" }),
    ], NOW);
    expect(people).toHaveLength(1);
  });

  // A booking with nothing on it is a broken row, not a customer. It
  // belongs on the ride board where it can be fixed.
  it("leaves a booking with no name, number, address or account out entirely", () => {
    expect(customerKey(makeRide({ passengerId: null, guestEmail: null, guestPhone: null, guestName: null }))).toBeNull();
    expect(customersFrom([makeRide({ passengerId: null, guestEmail: null, guestPhone: null, guestName: null })], NOW)).toEqual([]);
  });

  // The most recent form is the one they meant. A guest who changed
  // their number told us in the last booking, not the first.
  it("takes the contact details from their newest booking", () => {
    const people = customersFrom([
      makeRide({ id: "old", passengerId: "u1", guestPhone: "+297 111 1111", scheduledAt: at(-200) }),
      makeRide({ id: "new", passengerId: "u1", guestPhone: "+297 222 2222", scheduledAt: at(-2) }),
    ], NOW);
    expect(people[0].phone).toBe("+297 222 2222");
  });

  // Bookings and rides are different numbers. A guest who booked five
  // and cancelled four did not ride five times, and a "total rides"
  // column that said so would be wrong in the direction that flatters.
  it("counts rides taken apart from bookings made", () => {
    const people = customersFrom([
      makeRide({ id: "a", passengerId: "u1", status: "completed", fareAwg: 89.5, scheduledAt: at(-100) }),
      makeRide({ id: "b", passengerId: "u1", status: "cancelled", fareAwg: 89.5, scheduledAt: at(-50) }),
      makeRide({ id: "c", passengerId: "u1", status: "confirmed", fareAwg: 89.5, scheduledAt: at(48) }),
    ], NOW);
    expect(people[0].bookings).toBe(3);
    expect(people[0].completed).toBe(1);
    expect(people[0].cancelled).toBe(1);
    // and only the completed one is money that changed hands
    expect(people[0].spendUsd).toBeCloseTo(89.5 / 1.79, 6);
  });

  it("finds their next ride and their last one", () => {
    const people = customersFrom([
      makeRide({ id: "past", passengerId: "u1", status: "completed", scheduledAt: at(-72) }),
      makeRide({ id: "soon", passengerId: "u1", status: "confirmed", scheduledAt: at(10) }),
      makeRide({ id: "later", passengerId: "u1", status: "confirmed", scheduledAt: at(100) }),
    ], NOW);
    expect(people[0].next?.id).toBe("soon");
    expect(people[0].last?.id).toBe("past");
  });

  // Somebody with a ride coming is the row an operator is looking for.
  it("sorts the people with a ride coming to the top", () => {
    const people = customersFrom([
      makeRide({ id: "a", passengerId: "u1", status: "completed", scheduledAt: at(-10) }),
      makeRide({ id: "b", passengerId: "u2", status: "confirmed", scheduledAt: at(10) }),
    ], NOW);
    expect(people[0].key).toBe("a:u2");
  });

  it("searches the three things anybody actually has in their hand", () => {
    const [c] = customersFrom([makeRide({ passengerId: "u1", guestName: "Marta Vos", guestEmail: "m@vos.test" })], NOW);
    expect(matchesCustomer(c, "marta")).toBe(true);
    expect(matchesCustomer(c, "vos.test")).toBe(true);
    expect(matchesCustomer(c, "1234")).toBe(true);
    expect(matchesCustomer(c, "ritz")).toBe(false);
  });
});
