import { describe, it, expect } from "vitest";
import { shiftTime, driverWaitsFrom, collectAt, insideMinNotice } from "./derivedTime";

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
