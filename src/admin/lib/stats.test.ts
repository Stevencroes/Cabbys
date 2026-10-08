import { describe, it, expect } from "vitest";
import { makeDriver, makeRide } from "./fixtures";
import { aheadByDay, coveredFrom, dailyRides, fleetMix, todayMix, trailing, weeklyMoney } from "./stats";

const TODAY = "2026-10-08"; // a Thursday
const at = (day: string) => `${day}T16:00:00.000Z`; // midday on the island

describe("today, by state", () => {
  // The donut draws these five and the legend counts them. If they did
  // not add up to the day, the ring would show a slice no row explains.
  it("files every ride dated today in exactly one bucket", () => {
    const rides = [
      makeRide({ id: "a", status: "completed", scheduledAt: at(TODAY) }),
      makeRide({ id: "b", status: "en_route", driverId: "d1", scheduledAt: at(TODAY) }),
      makeRide({ id: "c", status: "driver_assigned", driverId: "d1", scheduledAt: at(TODAY) }),
      makeRide({ id: "d", status: "confirmed", scheduledAt: at(TODAY) }),
      makeRide({ id: "e", status: "cancelled", scheduledAt: at(TODAY) }),
      makeRide({ id: "f", status: "confirmed", scheduledAt: at("2026-10-09") }),
    ];
    expect(todayMix(rides, TODAY)).toEqual({ driven: 1, live: 1, booked: 1, open: 1, cancelled: 1, all: 5 });
  });
});

describe("the days ahead", () => {
  it("splits what is still to drive by whether anyone is driving it, and leaves closed rides out", () => {
    const rides = [
      makeRide({ id: "a", status: "confirmed", scheduledAt: at(TODAY) }),
      makeRide({ id: "b", status: "driver_assigned", driverId: "d1", scheduledAt: at(TODAY) }),
      makeRide({ id: "c", status: "completed", scheduledAt: at(TODAY) }),
      makeRide({ id: "d", status: "confirmed", scheduledAt: at("2026-10-14") }),
      makeRide({ id: "e", status: "confirmed", scheduledAt: at("2026-10-15") }), // the eighth day
    ];
    const week = aheadByDay(rides, TODAY, 7);
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ day: TODAY, covered: 1, open: 1 });
    expect(week[6]).toEqual({ day: "2026-10-14", covered: 0, open: 1 });
  });
});

describe("money over time", () => {
  // The current week has not finished. Drawn like the others it reads as
  // a collapse in trade, so it is marked.
  it("marks the week still filling, and only that one", () => {
    const weeks = weeklyMoney([], TODAY, 4);
    expect(weeks.map((w) => w.week)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(weeks.map((w) => w.partial)).toEqual([false, false, false, true]);
  });

  it("sums completed money only, through the ledger", () => {
    const rides = [
      makeRide({ id: "a", status: "completed", fareAwg: 179, completedAt: at("2026-10-06") }),
      makeRide({ id: "b", status: "confirmed", fareAwg: 179, scheduledAt: at("2026-10-09") }),
    ];
    const [w] = weeklyMoney(rides, TODAY, 1);
    expect(w.grossUsd).toBe(100);
    expect(w.rides).toBe(1);
  });

  // A week the history read only half reached is not a slow week.
  it("drops weeks that start before the history can be trusted", () => {
    const weeks = weeklyMoney([], TODAY, 4, "2026-09-22");
    expect(weeks.map((w) => w.week)).toEqual(["2026-09-28", "2026-10-05"]);
  });

  // Today against last Thursday would set a morning against a whole day
  // and report a fall every morning of the year.
  it("compares seven complete days with the seven before them", () => {
    const rides = [
      makeRide({ id: "now", status: "completed", fareAwg: 179, completedAt: at(TODAY) }),
      makeRide({ id: "this", status: "completed", fareAwg: 179, completedAt: at("2026-10-07") }),
      makeRide({ id: "this2", status: "completed", fareAwg: 179, completedAt: at("2026-10-01") }),
      makeRide({ id: "prev", status: "completed", fareAwg: 179, completedAt: at("2026-09-30") }),
    ];
    const t = trailing(rides, TODAY, 7);
    expect(t.current).toEqual({ grossUsd: 200, rides: 2 });
    expect(t.previous).toEqual({ grossUsd: 100, rides: 1 });
    expect(t.change).toBeCloseTo(1);
    expect(t.comparable).toBe(true);
  });

  it("gives no percentage over a previous period that earned nothing", () => {
    expect(trailing([], TODAY, 7).change).toBeNull();
  });

  it("withholds the comparison when the history does not reach the week before", () => {
    expect(trailing([], TODAY, 7, "2026-09-28").comparable).toBe(false);
  });

  it("counts rides per complete day, cancellations aside, ending yesterday", () => {
    const rides = [
      makeRide({ id: "a", scheduledAt: at("2026-10-07") }),
      makeRide({ id: "b", status: "cancelled", scheduledAt: at("2026-10-07") }),
      makeRide({ id: "c", scheduledAt: at(TODAY) }),
    ];
    const days = dailyRides(rides, TODAY, 3);
    expect(days).toEqual([
      { day: "2026-10-05", rides: 0 },
      { day: "2026-10-06", rides: 0 },
      { day: "2026-10-07", rides: 1 },
    ]);
  });
});

describe("a truncated history", () => {
  it("trusts the requested window when the read came back under its cap", () => {
    expect(coveredFrom([makeRide({ scheduledAt: at("2026-09-01") })], 800, "2026-06-10")).toBe("2026-06-10");
  });

  // At the cap the oldest rows are the ones cut, so the oldest day that
  // came back may itself be partial.
  it("starts the day after the oldest row when the read hit its cap", () => {
    const rows = [makeRide({ id: "a", scheduledAt: at("2026-09-20") }), makeRide({ id: "b", scheduledAt: at("2026-09-02") })];
    expect(coveredFrom(rows, 2, "2026-06-10")).toBe("2026-09-03");
  });
});

describe("the fleet", () => {
  // A driver who switched themselves off mid-ride is still in a car with
  // a guest in it.
  it("counts a driver holding a live ride as on duty even with the flag off", () => {
    const drivers = [
      makeDriver({ id: "a", isOnline: true }),
      makeDriver({ id: "b", isOnline: false }),
      makeDriver({ id: "c", isOnline: false }),
      makeDriver({ id: "d", status: "pending" }),
      makeDriver({ id: "e", status: "suspended", isOnline: true }),
    ];
    const rides = [makeRide({ status: "in_progress", driverId: "b" })];
    expect(fleetMix(drivers, rides)).toEqual({ approved: 3, pending: 1, suspended: 1, onDuty: 2 });
  });
});
