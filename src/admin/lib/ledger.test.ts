import { describe, it, expect } from "vitest";
import { booked, byDay, earnedOn, lines, total, totalOver } from "./ledger";
import { makeRide } from "./fixtures";
import { driverPayoutUsd, awgToUsd } from "../../lib/quote";

describe("the money", () => {
  // The rule the whole file exists for. The DRIVER's own Earnings screen
  // computes a payout through driverPayoutUsd(); if the operator's board
  // computed it any other way the two would disagree, and the driver's
  // is the one they would believe.
  it("pays a driver exactly what their own screen says", () => {
    const r = makeRide({ status: "completed", fareAwg: 89.5 });
    expect(total([r]).payoutUsd).toBeCloseTo(driverPayoutUsd(89.5), 10);
    expect(total([r]).grossUsd).toBeCloseTo(awgToUsd(89.5), 10);
  });

  // Derived by subtraction rather than by a second multiplication, so
  // the three figures on the screen cannot fail to add up.
  it("makes Cabby's share the remainder, so the lines always reconcile", () => {
    const t = total([makeRide({ status: "completed", fareAwg: 89.5 }), makeRide({ id: "b", status: "completed", fareAwg: 140 })]);
    expect(t.payoutUsd + t.feeUsd).toBeCloseTo(t.grossUsd, 10);
  });

  // A confirmed booking for next Tuesday is a promise, not revenue.
  it("counts completed work only", () => {
    const t = total([
      makeRide({ id: "a", status: "completed", fareAwg: 100 }),
      makeRide({ id: "b", status: "driver_assigned", fareAwg: 100 }),
      makeRide({ id: "c", status: "cancelled", fareAwg: 100 }),
    ]);
    expect(t.rides).toBe(1);
  });

  // A ride with no fare on the row is not a free ride — it is a row with
  // a missing number, and averaging zero into the total would be worse
  // than leaving it out.
  it("does not count a ride with no fare recorded", () => {
    expect(total([makeRide({ status: "completed", fareAwg: null })]).rides).toBe(0);
  });

  // A job booked Friday and driven Saturday is Saturday's money — the
  // same bucketing the driver's screen uses.
  it("files money under the day the ride was completed, not booked", () => {
    const r = makeRide({
      status: "completed",
      scheduledAt: "2026-09-01T23:00:00.000Z",     // 7pm on the 1st, Aruba
      completedAt: "2026-09-02T02:30:00.000Z",     // 10:30pm on the 1st, Aruba
    });
    expect(earnedOn(r)).toBe("2026-09-01");
  });

  // Rows written before completed_at existed are real money, and
  // dropping them would make an old month quietly shrink.
  it("falls back to the scheduled time for a ride completed before that column existed", () => {
    expect(earnedOn(makeRide({ status: "completed", completedAt: null, scheduledAt: "2026-09-01T18:35:00.000Z" })))
      .toBe("2026-09-01");
  });

  it("totals a named set of days and nothing outside it", () => {
    const days = byDay([
      makeRide({ id: "a", status: "completed", fareAwg: 100, completedAt: "2026-09-01T18:00:00.000Z" }),
      makeRide({ id: "b", status: "completed", fareAwg: 100, completedAt: "2026-09-05T18:00:00.000Z" }),
    ]);
    expect(totalOver(["2026-09-01"], days).rides).toBe(1);
    expect(totalOver(["2026-09-01", "2026-09-05"], days).rides).toBe(2);
    expect(totalOver(["2026-09-09"], days).rides).toBe(0);
  });

  // Kept in a different shape from Money on purpose, so it cannot be
  // added to revenue by anybody reaching for the wrong field.
  it("keeps what is booked apart from what was earned", () => {
    const ahead = booked([
      makeRide({ id: "a", status: "confirmed", fareAwg: 100 }),
      makeRide({ id: "b", status: "cancelled", fareAwg: 100 }),
      makeRide({ id: "c", status: "completed", fareAwg: 100 }),
    ]);
    // Only the one still to happen. The cancelled ride is not coming and
    // the completed one has already been counted as revenue — adding
    // either to "booked ahead" would double-count the day.
    expect(ahead.rides).toBe(1);
  });

  it("lists transactions newest first and carries the ride with each", () => {
    const rows = lines([
      makeRide({ id: "old", status: "completed", fareAwg: 100, completedAt: "2026-09-01T10:00:00.000Z" }),
      makeRide({ id: "new", status: "completed", fareAwg: 100, completedAt: "2026-09-03T10:00:00.000Z" }),
    ]);
    expect(rows.map((l) => l.ride.id)).toEqual(["new", "old"]);
    expect(rows[0].grossUsd).toBeCloseTo(rows[0].payoutUsd + rows[0].feeUsd, 10);
  });
});
