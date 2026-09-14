import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "../BoardContext";
import { attentionItems } from "../lib/attention";
import { makeBoard, makeRide } from "../lib/fixtures";
import { todayInAruba } from "../../lib/datetime";

const state: { board: Board } = { board: makeBoard() };
vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));

import Dashboard from "./Dashboard";

/** A ride at a fixed hour of TODAY, because the screen's whole job is to
    answer "today", and a fixture pinned to a date in the past would put
    every assertion on the wrong side of it. */
const todayAt = (hhmm: string) => `${todayInAruba()}T${hhmm}:00.000Z`;

const renderBoard = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

beforeEach(() => { state.board = makeBoard(); });

describe("the dashboard", () => {
  // The single most load-bearing decision on this screen. An operator
  // who sees the same six panels every day, four of them permanently
  // blank, stops reading any of them — and the morning something IS
  // wrong the alert lands in furniture.
  it("shows no alerts section at all when nothing needs attention", () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "driver_assigned", driverId: "d1", driverName: "Ana", driverPlate: "A-1", scheduledAt: todayAt("22:00") })],
    });
    renderBoard();
    expect(screen.queryByText("Needs you")).toBeNull();
    expect(screen.getByText("Coming up")).toBeInTheDocument();
  });

  it("leads with what needs a person the moment there is any", () => {
    const rides = [makeRide({ scheduledAt: todayAt("22:00") })];
    state.board = makeBoard({ rides, attention: attentionItems(rides, []) });
    renderBoard();
    expect(screen.getByText("Needs you")).toBeInTheDocument();
  });

  // "On the road now" is a section about cars that are moving. With
  // none, it is a heading over nothing.
  it("shows nothing about live rides when none are live", () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: todayAt("22:00") })] });
    renderBoard();
    expect(screen.queryByText("On the road now")).toBeNull();
  });

  it("shows the live rides when there are any", () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "en_route", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-1", scheduledAt: todayAt("22:00") })],
    });
    renderBoard();
    expect(screen.getByText("On the road now")).toBeInTheDocument();
  });

  // A revenue figure that counts tonight's bookings is the figure that
  // makes a company feel richer than it is.
  it("counts only completed work in today's money, and says so", () => {
    state.board = makeBoard({
      rides: [
        makeRide({ id: "a", status: "completed", fareAwg: 89.5, scheduledAt: todayAt("14:00"), completedAt: todayAt("14:40") }),
        makeRide({ id: "b", status: "confirmed", fareAwg: 179, scheduledAt: todayAt("22:00") }),
      ],
    });
    renderBoard();
    expect(screen.getByText("$50")).toBeInTheDocument();
    expect(screen.getByText("completed rides only")).toBeInTheDocument();
    expect(screen.queryByText("$150")).toBeNull();
  });

  // The count that is only ever a problem when it is not zero carries a
  // word under it as well as a colour.
  it("says in words why the unassigned count matters", () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: todayAt("22:00") })] });
    renderBoard();
    expect(screen.getByText("nobody is driving these")).toBeInTheDocument();
  });

  it("does not call an unreadable board a quiet day", () => {
    state.board = makeBoard({ ridesError: "permission denied for table rides" });
    renderBoard();
    expect(screen.getByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.queryByText("Coming up")).toBeNull();
  });

  it("says plainly that nothing is booked rather than showing an empty list", () => {
    renderBoard();
    expect(screen.getByText(/nothing else booked/i)).toBeInTheDocument();
  });
});
