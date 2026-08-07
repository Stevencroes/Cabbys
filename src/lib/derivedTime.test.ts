import { describe, it, expect } from "vitest";
import { MIN_NOTICE_HOURS, MIN_NOTICE_MS, collectAt, driverWaitsFrom, insideMinNotice, shiftTime } from "./derivedTime";

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

  it("min-notice flags pickups inside 3 hours without flagging far-future rides", () => {
    const now = new Date("2026-07-20T10:00:00");
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
    const now = new Date("2026-08-07T12:00:00");
    // an hour away — inside the window, so the notice shows
    expect(insideMinNotice("2026-08-07", "13:00", now)).toBe(true);
    // comfortably ahead — no notice
    expect(insideMinNotice("2026-08-09", "13:00", now)).toBe(false);
    // the notice is advisory: nothing here returns a validation failure,
    // so the booking still goes through (see BookingOverlay for the funnel)
  });
});
