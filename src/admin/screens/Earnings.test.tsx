import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "../BoardContext";
import { makeBoard, makeRide } from "../lib/fixtures";
import { addDays, todayInAruba } from "../../lib/datetime";

const state: { board: Board; history: unknown } = {
  board: makeBoard(),
  history: { rides: [], error: null },
};

vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));
vi.mock("../lib/admin", async (orig) => ({
  ...(await orig<typeof import("../lib/admin")>()),
  loadRideHistory: () => Promise.resolve(state.history),
}));

import Earnings from "./Earnings";

const today = todayInAruba();
const atNoon = (day: string) => `${day}T16:00:00.000Z`; // midday on the island

async function renderMoney() {
  const r = render(<MemoryRouter><Earnings /></MemoryRouter>);
  await act(async () => {});
  return r;
}

beforeEach(() => {
  state.board = makeBoard();
  state.history = { rides: [], error: null };
});

describe("earnings", () => {
  // A revenue figure that counts tonight's bookings is the figure that
  // makes a company feel richer than it is.
  it("counts completed work only, and shows what is booked separately", async () => {
    state.board = makeBoard({
      rides: [
        makeRide({ id: "done", status: "completed", fareAwg: 179, completedAt: atNoon(today) }),
        makeRide({ id: "ahead", status: "confirmed", fareAwg: 179 }),
      ],
    });
    await renderMoney();
    // $100 earned, and the booked one stated under its own heading
    expect(screen.getAllByText("$100").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 not yet driven — not counted above/i)).toBeInTheDocument();
  });

  // The three lines have to add up, on screen, or an operator reconciling
  // against Stripe stops trusting all three.
  it("splits a fare into the driver's share and Cabby's, and says the rate", async () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "completed", fareAwg: 179, completedAt: atNoon(today) })],
    });
    await renderMoney();
    // once in the figure strip and once on the transaction line — both
    // are the same arithmetic, which is the point
    expect(screen.getAllByText("$75").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$25").length).toBeGreaterThan(0);
    expect(screen.getByText("25% commission")).toBeInTheDocument();
  });

  // Today's money lives in the UPCOMING read, not the history one. Losing
  // it would empty the single figure most likely to be checked.
  it("finds today's completed rides even though they are not history yet", async () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "completed", fareAwg: 179, completedAt: atNoon(today) })],
    });
    await renderMoney();
    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(screen.getByText("1 ride driven")).toBeInTheDocument();
  });

  // There is no refund path in this project, so a refunds total would be
  // a permanent zero pretending to be a measurement.
  it("shows no refunds line, because nothing here can refund anything", async () => {
    await renderMoney();
    expect(screen.queryByText(/refund/i)).toBeNull();
  });

  it("opens a single day out of the chart", async () => {
    state.history = {
      rides: [makeRide({ id: "y", status: "completed", fareAwg: 179, completedAt: atNoon(addDays(today, -1)) })],
      error: null,
    };
    await renderMoney();
    const bars = screen.getAllByRole("button", { name: /\$\d+ over \d+ rides/ });
    // the chart labels every bar in words, because a bar height is not
    // readable by anything but an eye
    expect(bars.length).toBe(14);
    fireEvent.click(bars[12]);
    expect(screen.getByText(/show the whole period/i)).toBeInTheDocument();
  });

  // Zero is an answer and "I couldn't look" is a different one — and on
  // the money screen the difference is somebody concluding a quiet month.
  it("does not report an unreadable rides table as a month with no money in it", async () => {
    state.board = makeBoard({ ridesError: "permission denied for table rides" });
    await renderMoney();
    expect(screen.getByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.getByText(/a zero here would be a wrong answer/i)).toBeInTheDocument();
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("says a quiet period is a quiet period rather than a broken query", async () => {
    await renderMoney();
    expect(screen.getByText(/nothing driven in this period yet/i)).toBeInTheDocument();
  });
});
