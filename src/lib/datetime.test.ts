import { describe, it, expect } from "vitest";
import {
  formatDate, formatTime, formatDateTime, todayInAruba, arubaInstant,
  to12Hour, to24Hour, addDays, addMonths, monthGrid, monthLabel, isHhmm,
} from "./datetime";

describe("dates and times (Phase 1)", () => {
  it("renders a date the same way under every browser locale", () => {
    // The acceptance criterion: en-US and nl-NL must agree. Our formatter
    // never calls toLocaleDateString, so the output cannot vary.
    const iso = "2026-08-07";
    expect(formatDate(iso)).toBe("Fri 7 Aug 2026");
    expect(formatDate(iso)).not.toMatch(/\d{2}\/\d{2}/); // never 07/08
  });

  it("never renders a bare numeric date", () => {
    for (const iso of ["2026-01-02", "2026-12-31", "2027-03-09"]) {
      expect(formatDate(iso)).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    }
  });

  it("always states AM or PM", () => {
    expect(formatTime("14:35")).toBe("2:35 PM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("09:00")).toBe("9:00 AM");
  });

  it("refuses to format a partial time", () => {
    // "--:30" was reachable in the old native input
    expect(formatTime(":30")).toBe("");
    expect(formatTime("")).toBe("");
    expect(isHhmm("2:")).toBe(false);
    expect(formatDateTime("2026-08-07", "")).toBe("Fri 7 Aug 2026");
  });

  it("round-trips 12- and 24-hour clocks", () => {
    for (const t of ["00:00", "01:07", "11:59", "12:00", "12:30", "23:45"]) {
      expect(to24Hour(to12Hour(t)!)).toBe(t);
    }
    expect(to12Hour("14:35")).toEqual({ hour: 2, minute: 35, meridiem: "PM" });
  });

  it("reads today from Aruba's clock, not the browser's", () => {
    // 01:30 UTC on the 8th is still 21:30 on the 7th in Aruba (UTC−4)
    const utcEarlyMorning = Date.parse("2026-08-08T01:30:00Z");
    expect(todayInAruba(utcEarlyMorning)).toBe("2026-08-07");
    // and midday UTC is the same calendar day
    expect(todayInAruba(Date.parse("2026-08-08T12:00:00Z"))).toBe("2026-08-08");
  });

  it("persists an instant anchored to Aruba, not to the visitor", () => {
    // 14:35 on the island is 18:35 UTC whoever is booking
    expect(arubaInstant("2026-08-07", "14:35")).toBe("2026-08-07T18:35:00.000Z");
  });

  it("does calendar arithmetic without slipping a day", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"); // clamps
    expect(addMonths("2026-03-15", -1)).toBe("2026-02-15");
    expect(monthLabel("2026-08-07")).toBe("August 2026");
  });

  it("builds a six-week grid that contains the whole month", () => {
    const grid = monthGrid("2026-08-07");
    expect(grid).toHaveLength(42);
    expect(grid).toContain("2026-08-01");
    expect(grid).toContain("2026-08-31");
    expect(new Date(`${grid[0]}T12:00:00Z`).getUTCDay()).toBe(0); // Sunday-first
  });
});
