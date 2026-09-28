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

  it("flags the fee window inside 24 h", () => {
    const pickup = new Date("2026-07-09T08:00:00");
    const info = cancellationInfo(pickup, now);
    expect(info.free).toBe(false);
    expect(info.hoursUntil).toBeLessThan(FREE_CANCEL_HOURS);
  });

  it("parses scheduled date+time and tolerates blanks", () => {
    expect(scheduledDate("2026-07-10", "14:30")?.getHours()).toBe(14);
    expect(scheduledDate("", "")).toBeNull();
    // Undated rides are treated as freely cancellable, never blocked.
    expect(cancellationInfo(null, now).free).toBe(true);
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
