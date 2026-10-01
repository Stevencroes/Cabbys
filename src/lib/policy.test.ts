import { describe, it, expect } from "vitest";
import { cancellationInfo, scheduledDate, FREE_CANCEL_HOURS } from "./policy";

describe("cancellation policy", () => {
  const now = new Date("2026-07-08T12:00:00");

  it("is free outside the window", () => {
    const pickup = new Date("2026-07-10T12:00:00");
    const info = cancellationInfo(pickup, now);
    expect(info.free).toBe(true);
    expect(info.hoursUntil).toBe(48);
  });

  // There is no late fee while payment is cash to the driver: inside the
  // window it is still free, and only the ask changes.
  it("stays free inside 24 h, and asks to cancel early", () => {
    const pickup = new Date("2026-07-09T08:00:00");
    const info = cancellationInfo(pickup, now);
    expect(info.free).toBe(true);
    expect(info.late).toBe(true);
    expect(info.hoursUntil).toBeLessThan(FREE_CANCEL_HOURS);
    expect(info.label).toMatch(/still free/);
    expect(info.label).toMatch(/as soon as you know/);
    expect(info.label).not.toMatch(/fee/i);
  });

  it("is not late outside the window, and not free once pickup has passed", () => {
    expect(cancellationInfo(new Date("2026-07-10T12:00:00"), now).late).toBe(false);
    const gone = cancellationInfo(new Date("2026-07-08T10:00:00"), now);
    expect(gone.free).toBe(false);
    expect(gone.late).toBe(false);
  });

  it("parses scheduled date+time and tolerates blanks", () => {
    expect(scheduledDate("2026-07-10", "14:30")?.getHours()).toBe(14);
    expect(scheduledDate("", "")).toBeNull();
    // Undated rides are treated as freely cancellable, never blocked.
    expect(cancellationInfo(null, now).free).toBe(true);
  });
});

describe("waiting time", () => {
  it("is the owner's numbers: 60 minutes after landing, 15 at an address", async () => {
    const { AIRPORT_FREE_WAIT_MINUTES, ADDRESS_FREE_WAIT_MINUTES } = await import("./policy");
    expect(AIRPORT_FREE_WAIT_MINUTES).toBe(60);
    expect(ADDRESS_FREE_WAIT_MINUTES).toBe(15);
  });
});

describe("the confirmation window, as a person says it", () => {
  it("reads in hours when it is whole hours, in minutes otherwise", async () => {
    const { confirmWindowLabel, CONFIRM_WINDOW_MINUTES } = await import("./policy");
    expect(CONFIRM_WINDOW_MINUTES).toBe(60);
    expect(confirmWindowLabel()).toBe("1 hour");
    expect(confirmWindowLabel(120)).toBe("2 hours");
    expect(confirmWindowLabel(45)).toBe("45 minutes");
    expect(confirmWindowLabel(90)).toBe("90 minutes");
  });
});
