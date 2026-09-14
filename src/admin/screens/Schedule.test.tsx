import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "../BoardContext";
import { makeBoard, makeDriver, makeRide } from "../lib/fixtures";
import { addDays, todayInAruba } from "../../lib/datetime";

const state: { board: Board } = { board: makeBoard() };
vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));

import Schedule from "./Schedule";

const today = todayInAruba();
/** Aruba is UTC−4 all year, so an hour on the island is that hour +4 in
    the stored instant. Written out rather than computed, because a test
    that derives the offset the same way the code does would pass even
    if both were wrong. */
const at = (day: string, hourOnIsland: number) =>
  `${day}T${String(hourOnIsland + 4).padStart(2, "0")}:30:00.000Z`;

const renderDay = () => render(<MemoryRouter><Schedule /></MemoryRouter>);

beforeEach(() => { state.board = makeBoard(); });

describe("the schedule", () => {
  it("opens on today and reads down the clock", () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: at(today, 9) })] });
    renderDay();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });

  // A gap is information on a dispatch board: it is where the next
  // booking fits, and it is why the 6am and the 11pm look nothing alike.
  it("draws the empty hours between two bookings", () => {
    state.board = makeBoard({
      rides: [makeRide({ id: "a", scheduledAt: at(today, 9) }), makeRide({ id: "b", scheduledAt: at(today, 12) })],
    });
    renderDay();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getAllByText("Nothing booked").length).toBeGreaterThan(0);
  });

  // A day that starts at 9am should not open with nine empty rows.
  it("does not draw hours outside the day's own work", () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: at(today, 9) })] });
    renderDay();
    expect(screen.queryByText("03:00")).toBeNull();
  });

  // Every warning is a sentence. The accent rule beside it says the same
  // thing a second time, never the first.
  it("says in words when one driver is on two rides at once", () => {
    state.board = makeBoard({
      rides: [
        makeRide({ id: "a", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-1", status: "driver_assigned", scheduledAt: at(today, 9) }),
        makeRide({ id: "b", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-1", status: "driver_assigned", scheduledAt: at(today, 10) }),
      ],
    });
    renderDay();
    expect(screen.getAllByText(/within 90 minutes/i).length).toBe(2);
  });

  it("says when the driver holding a ride is on hold", () => {
    state.board = makeBoard({
      rides: [makeRide({ driverId: "d1", driverName: "Ana", driverPlate: "A-1", status: "driver_assigned", scheduledAt: at(today, 9) })],
      drivers: [makeDriver({ id: "d1", status: "suspended" })],
    });
    renderDay();
    expect(screen.getByText(/on hold and can't take new work/i)).toBeInTheDocument();
  });

  // The week strip is the only week view worth having here: it answers
  // "which day needs me" in a glance and then gets out of the way.
  it("shows how many rides each day holds and how many have nobody on them", () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: at(today, 9) })] });
    renderDay();
    // the strip's own cell, and the day heading's count beside it
    expect(screen.getAllByText("1 ride").length).toBe(2);
    expect(screen.getByText("1 open")).toBeInTheDocument();
  });

  it("walks to another day and says which one it is", () => {
    const tomorrow = addDays(today, 1);
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: at(tomorrow, 9) })] });
    renderDay();
    // today is empty; the strip still shows tomorrow's work
    expect(screen.getByText(/nothing booked today/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("1 ride")[0].closest("button")!);
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  // A ride with no date belongs to no day, so it would appear on none of
  // them — invisible on the one screen whose job is to notice what is
  // not covered. It is filed under today, under its own heading, rather
  // than dropped or drawn as a booking at midnight.
  it("keeps an undated ride on today rather than dropping it", () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: null })] });
    renderDay();
    expect(screen.getByText("No time")).toBeInTheDocument();
    expect(screen.queryByText(/nothing booked today/i)).toBeNull();
  });

  it("does not call an unreadable board an empty day", () => {
    state.board = makeBoard({ ridesError: "permission denied for table rides" });
    renderDay();
    expect(screen.getByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing booked today/i)).toBeNull();
  });
});
