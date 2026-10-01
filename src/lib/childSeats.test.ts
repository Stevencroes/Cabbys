import { describe, it, expect } from "vitest";
import { SEAT_AGE_OPTIONS, seatAgesLabel, seatNote, firstMissingSeatAge } from "./childSeats";

describe("child seat ages", () => {
  it("offers under 1, then 1 to 12", () => {
    expect(SEAT_AGE_OPTIONS[0]).toEqual({ value: "0", label: "Under 1" });
    expect(SEAT_AGE_OPTIONS[SEAT_AGE_OPTIONS.length - 1]).toEqual({ value: "12", label: "12 years old" });
    expect(SEAT_AGE_OPTIONS).toHaveLength(13);
  });

  it("reads the ages as one string, the way they are stored", () => {
    expect(seatAgesLabel(["3"])).toBe("3");
    expect(seatAgesLabel(["2", "5"])).toBe("2 and 5");
    expect(seatAgesLabel(["0", "4"])).toBe("under 1 and 4");
    expect(seatAgesLabel(["2", ""])).toBe("2");
  });

  it("writes the notes line the driver and the team read", () => {
    expect(seatNote(0, ["3"])).toBe("");
    expect(seatNote(1, ["3"])).toBe("Child seats: 1 (age 3)");
    expect(seatNote(2, ["2", "5"])).toBe("Child seats: 2 (ages 2 and 5)");
    // a stale second age is not written for one seat
    expect(seatNote(1, ["0", "7"])).toBe("Child seats: 1 (age under 1)");
  });

  it("requires an age for every seat, and none for no seats", () => {
    expect(firstMissingSeatAge(0, [])).toBe(-1);
    expect(firstMissingSeatAge(1, [])).toBe(0);
    expect(firstMissingSeatAge(2, ["4"])).toBe(1);
    expect(firstMissingSeatAge(2, ["4", ""])).toBe(1);
    // "0" is under 1, a real answer — not a blank
    expect(firstMissingSeatAge(2, ["0", "4"])).toBe(-1);
  });
});
