import { act, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "../BoardContext";
import { attentionItems } from "../lib/attention";
import { makeBoard, makeRide } from "../lib/fixtures";
import { addDays, todayInAruba } from "../../lib/datetime";

const state: { board: Board; history: unknown } = {
  board: makeBoard(),
  history: { rides: [], error: null },
};
vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));
// The charts' history read is the dashboard's own, like Earnings'. Mocked
// at the loader, so these tests are about what an operator is SHOWN.
vi.mock("../lib/admin", async (orig) => ({
  ...(await orig<typeof import("../lib/admin")>()),
  loadRideHistory: () => Promise.resolve(state.history),
}));

import Dashboard from "./Dashboard";

/** A ride at a fixed hour of TODAY, because the screen's whole job is to
    answer "today", and a fixture pinned to a date in the past would put
    every assertion on the wrong side of it. */
const todayAt = (hhmm: string) => `${todayInAruba()}T${hhmm}:00.000Z`;

async function renderBoard() {
  const r = render(<MemoryRouter><Dashboard /></MemoryRouter>);
  await act(async () => {});
  return r;
}

/** One reading on the tile row, found by its label. */
const tile = (label: string) => screen.getByText(label).closest(".adm-tile") as HTMLElement;

beforeEach(() => {
  state.board = makeBoard();
  state.history = { rides: [], error: null };
});

describe("the dashboard", async () => {
  // The single most load-bearing decision on this screen. An operator
  // who sees the same six panels every day, four of them permanently
  // blank, stops reading any of them — and the morning something IS
  // wrong the alert lands in furniture.
  it("shows no alerts section at all when nothing needs attention", async () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "driver_assigned", driverId: "d1", driverName: "Ana", driverPlate: "A-1", scheduledAt: todayAt("22:00") })],
    });
    await renderBoard();
    expect(screen.queryByText("Needs you")).toBeNull();
    expect(screen.getByText("Coming up")).toBeInTheDocument();
  });

  it("leads with what needs a person the moment there is any", async () => {
    const rides = [makeRide({ scheduledAt: todayAt("22:00") })];
    state.board = makeBoard({ rides, attention: attentionItems(rides, []) });
    await renderBoard();
    expect(screen.getByText("Needs you")).toBeInTheDocument();
  });

  // "On the road now" is a section about cars that are moving. With
  // none, it is a heading over nothing.
  it("shows nothing about live rides when none are live", async () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: todayAt("22:00") })] });
    await renderBoard();
    expect(screen.queryByText("On the road now")).toBeNull();
  });

  it("shows the live rides when there are any", async () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "en_route", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-1", scheduledAt: todayAt("22:00") })],
    });
    await renderBoard();
    expect(screen.getByText("On the road now")).toBeInTheDocument();
  });

  // A revenue figure that counts tonight's bookings is the figure that
  // makes a company feel richer than it is.
  it("counts only completed work in today's money, and says so", async () => {
    state.board = makeBoard({
      rides: [
        makeRide({ id: "a", status: "completed", fareAwg: 89.5, scheduledAt: todayAt("14:00"), completedAt: todayAt("14:40") }),
        makeRide({ id: "b", status: "confirmed", fareAwg: 179, scheduledAt: todayAt("22:00") }),
      ],
    });
    await renderBoard();
    // the tile, not the weekly chart, which also counts today's $50
    expect(within(tile("Earned today")).getByText("$50")).toBeInTheDocument();
    expect(within(tile("Earned today")).getByText("completed rides only")).toBeInTheDocument();
    expect(screen.queryByText("$150")).toBeNull();
  });

  // The count that is only ever a problem when it is not zero carries a
  // word under it as well as a colour.
  it("says in words why the unassigned count matters", async () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: todayAt("22:00") })] });
    await renderBoard();
    expect(screen.getByText("nobody is driving these")).toBeInTheDocument();
  });

  it("does not call an unreadable board a quiet day", async () => {
    state.board = makeBoard({ ridesError: "permission denied for table rides" });
    await renderBoard();
    expect(screen.getByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.queryByText("Coming up")).toBeNull();
  });

  it("says plainly that nothing is booked rather than showing an empty list", async () => {
    await renderBoard();
    expect(screen.getByText(/nothing else booked/i)).toBeInTheDocument();
  });

  // The house rule, for something that draws: a failed read is never a
  // flat line at zero. And the rest of the board stays up — a missing
  // history is not a reason to hide who is waiting at arrivals.
  it("says the history could not be read, and keeps the rest of the board", async () => {
    state.history = { rides: [], error: "permission denied for table rides" };
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: todayAt("22:00") })] });
    await renderBoard();
    expect(screen.getAllByText(/can't read the ride history/i).length).toBe(2);
    expect(within(tile("Earned, last 7 days")).queryByText("$0")).toBeNull();
    expect(within(tile("Earned, last 7 days")).getByText(/couldn't read the history/i)).toBeInTheDocument();
    expect(screen.getByText("Coming up")).toBeInTheDocument();
  });

  // Like for like: seven complete days against the seven before.
  it("compares the last seven days with the seven before them, in words", async () => {
    const day = (n: number) => addDays(todayInAruba(), n);
    state.history = {
      rides: [
        makeRide({ id: "a", status: "completed", fareAwg: 179, completedAt: `${day(-1)}T16:00:00.000Z` }),
        makeRide({ id: "b", status: "completed", fareAwg: 179, completedAt: `${day(-2)}T16:00:00.000Z` }),
        makeRide({ id: "c", status: "completed", fareAwg: 179, completedAt: `${day(-9)}T16:00:00.000Z` }),
      ],
      error: null,
    };
    await renderBoard();
    const t = tile("Earned, last 7 days");
    expect(within(t).getByText("$200")).toBeInTheDocument();
    expect(within(t).getByText(/up 100%/i)).toBeInTheDocument();
  });

  // A chart is never the only place a number lives.
  it("gives every chart a table view", async () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: todayAt("22:00") })] });
    await renderBoard();
    const next = screen.getByText("The next seven days").closest("section") as HTMLElement;
    act(() => { within(next).getByRole("button", { name: "Table" }).click(); });
    expect(within(next).getByRole("columnheader", { name: "Need a driver" })).toBeInTheDocument();
  });
});
