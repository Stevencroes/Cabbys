import { describe, it, expect } from "vitest";
import { MIN_NOTICE_HOURS, MIN_NOTICE_MS, collectAt, driverWaitsFrom, durationLabel, insideMinNotice, shiftTime } from "./derivedTime";
import { arubaInstant } from "./datetime";

describe("derived pickup times (§3.6)", () => {
  it("driver waits from landing + 30", () => {
    expect(driverWaitsFrom("14:05")).toBe("14:35");
    expect(driverWaitsFrom("23:45")).toBe("00:15"); // wraps midnight
  });

  it("US departures work back 3 h (island pre-clearance), others 2h15", () => {
    expect(collectAt("14:00", true)).toBe("11:00");
    expect(collectAt("14:00", false)).toBe("11:45");
    expect(collectAt("01:30", true)).toBe("22:30"); // wraps midnight
  });

  it("shiftTime tolerates junk", () => {
    expect(shiftTime("nope", 30)).toBe("nope");
  });

  it("min-notice flags pickups inside the window without flagging far-future rides", () => {
    // 10:00 in Aruba, written as the instant it is
    const now = new Date("2026-07-20T10:00:00-04:00");
    expect(insideMinNotice("2026-07-20", "11:30", now)).toBe(true);
    expect(insideMinNotice("2026-07-20", "16:00", now)).toBe(false);
    expect(insideMinNotice("", "", now)).toBe(false);
  });
});

describe("minimum lead time (Phase 4)", () => {
  it("keeps the window in one named constant", () => {
    expect(MIN_NOTICE_MS).toBe(MIN_NOTICE_HOURS * 3_600_000);
  });

  it("flags a late booking without refusing it", () => {
    const now = new Date("2026-08-07T12:00:00-04:00");
    // an hour away — inside the window, so the notice shows
    expect(insideMinNotice("2026-08-07", "13:00", now)).toBe(true);
    // comfortably ahead — no notice
    expect(insideMinNotice("2026-08-09", "13:00", now)).toBe(false);
    // the notice is advisory: nothing here returns a validation failure,
    // so the booking still goes through (see BookingOverlay for the funnel)
  });
});

// The pickup a guest picks is island time, wherever they are when they
// pick it. These instants are written out in UTC so nothing here depends
// on the timezone the tests happen to run in.
describe("minimum notice is measured on Aruba's clock", () => {
  // noon in Aruba on 7 Aug 2026 = 16:00 UTC (Aruba is UTC−4 all year)
  const noonAruba = new Date("2026-08-07T16:00:00Z");

  it("does not warn a guest booking 8 PM tonight, 8 hours away (the Amsterdam case)", () => {
    // read in Dutch time, 8 PM was 2 PM on the island — 2 hours away
    expect(insideMinNotice("2026-08-07", "20:00", noonAruba)).toBe(false);
  });

  it("does warn a guest booking 1:30 PM, 90 minutes away (the California case)", () => {
    // read in California time, 1:30 PM was 4:30 PM on the island — 4½ hours away
    expect(insideMinNotice("2026-08-07", "13:30", noonAruba)).toBe(true);
  });

  it("puts the edge of the window exactly MIN_NOTICE_HOURS (2) out on the island", () => {
    expect(MIN_NOTICE_HOURS).toBe(2);
    expect(insideMinNotice("2026-08-07", "13:59", noonAruba)).toBe(true);
    expect(insideMinNotice("2026-08-07", "14:00", noonAruba)).toBe(false);
  });

  it("stays quiet on half-typed input rather than guessing or throwing", () => {
    expect(insideMinNotice("2026-08-07", "", noonAruba)).toBe(false);
    expect(insideMinNotice("2026-08-07", "soon", noonAruba)).toBe(false);
    expect(insideMinNotice("2026-13-45", "14:00", noonAruba)).toBe(false);
    expect(insideMinNotice("", "14:00", noonAruba)).toBe(false);
  });

  it("reads a time written without its leading zero", () => {
    expect(insideMinNotice("2026-08-07", "9:30", new Date("2026-08-07T12:00:00Z"))).toBe(true);
    expect(arubaInstant("2026-08-07", "9:30")).toBe("2026-08-07T13:30:00.000Z");
  });
});

describe("durationLabel", () => {
  it("says a span the way a person would", () => {
    expect(durationLabel(180)).toBe("3 hours");
    expect(durationLabel(135)).toBe("2 hours 15 minutes");
    expect(durationLabel(60)).toBe("1 hour");
    expect(durationLabel(61)).toBe("1 hour 1 minute");
    expect(durationLabel(45)).toBe("45 minutes");
    expect(durationLabel(MIN_NOTICE_HOURS * 60)).toBe(`${MIN_NOTICE_HOURS} hours`);
  });
});
