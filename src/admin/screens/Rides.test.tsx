import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "../BoardContext";
import { makeBoard, makeRide } from "../lib/fixtures";

const state: { board: Board } = { board: makeBoard() };
const navigate = vi.fn();

vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

import Rides from "./Rides";

const renderBoard = () => render(<MemoryRouter><Rides /></MemoryRouter>);

beforeEach(() => {
  state.board = makeBoard({ rides: [makeRide()] });
  navigate.mockClear();
});

describe("Ride requests", () => {
  // A booking with no driver is the only row here that will not resolve
  // itself: an assigned ride runs, a cancelled one is over, and an
  // unassigned one just gets closer to its pickup time. So it is where
  // the board opens.
  it("opens on the rides nobody is driving", async () => {
    state.board = makeBoard({
      rides: [
        makeRide({ id: "r1" }),
        makeRide({ id: "r2", driverId: "d1", status: "driver_assigned", driverName: "Ana Croes", driverPlate: "A-12345" }),
      ],
    });
    renderBoard();
    expect(await screen.findByRole("button", { name: /needs a driver/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Ana Croes")).toBeNull();
  });

  // Wrong currency and wrong party is how this project once advertised a
  // ƒ89.50 job as "$90". The board is reconciled against Stripe, so the
  // figure here is the GUEST's fare, not the driver's cut.
  it("shows what the guest was charged, not what the driver earns", async () => {
    renderBoard();
    expect(await screen.findByText("$50")).toBeInTheDocument();
    expect(screen.queryByText("$38")).toBeNull();
    expect(screen.queryByText("$90")).toBeNull();
  });

  // A row opens the ride; it does not expand. An operator comparing
  // thirty rides wants thirty rows the same height.
  it("opens the ride rather than growing the row", () => {
    renderBoard();
    fireEvent.click(screen.getByText("Marta Vos").closest("tr")!);
    expect(navigate).toHaveBeenCalledWith("/admin/rides/r1");
  });

  // A <tr> with an onClick and nothing focusable inside it is a row only
  // a mouse can open.
  it("gives every row a real link, so a keyboard can open it too", () => {
    renderBoard();
    expect(screen.getByRole("link", { name: "Marta Vos" })).toHaveAttribute("href", "/admin/rides/r1");
  });

  // admin_assign_ride refuses a cancelled or completed ride. A control
  // that exists only to be refused is worse than no control — this says
  // why instead.
  it("does not offer to assign a ride the database would refuse", async () => {
    state.board = makeBoard({ rides: [makeRide({ status: "cancelled" })] });
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /^cancelled/i }));
    expect(screen.queryByRole("link", { name: /put a driver on/i })).toBeNull();
    expect(screen.getByText(/nobody drove this — it was called off/i)).toBeInTheDocument();
  });

  // The bug claim_ride() was fixed for, seen from the operator's side: a
  // ride can have a driver and still show the guest nothing, because the
  // five driver_* columns are what My Trips reads.
  it("says when an assigned ride shows the guest no car", async () => {
    state.board = makeBoard({
      rides: [makeRide({ driverId: "d1", status: "driver_assigned", driverName: "Ana Croes" })],
    });
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /^assigned/i }));
    expect(screen.getByText(/no car shown to the guest/i)).toBeInTheDocument();
  });

  it("says so plainly when nothing is booked from today on", async () => {
    state.board = makeBoard({ rides: [] });
    renderBoard();
    expect(await screen.findByText(/nothing booked from today on/i)).toBeInTheDocument();
  });

  // "No unassigned rides" is the best news on this screen and "the board
  // is empty" is a different fact entirely. Reading the first as the
  // second is how somebody concludes bookings have stopped arriving.
  it("tells an empty filter apart from an empty board", async () => {
    state.board = makeBoard({
      rides: [makeRide({ driverId: "d1", status: "driver_assigned", driverName: "Ana Croes" })],
    });
    renderBoard();
    expect(await screen.findByText(/every ride has a driver/i)).toBeInTheDocument();
    expect(screen.getByText(/all 1 booking from today on are covered/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing booked from today on/i)).toBeNull();
  });

  // Bookings keep arriving while the board cannot see them. An operator
  // who reads a failed read as a quiet day will not go looking.
  it("does not call an unreadable board a quiet day", async () => {
    state.board = makeBoard({ rides: [], ridesError: "permission denied for table rides" });
    renderBoard();
    expect(await screen.findByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table rides/)).toBeInTheDocument();
    expect(screen.queryByText(/nothing booked from today on/i)).toBeNull();
  });

  // A ride with no date is broken, and a broken ride hidden from the one
  // screen that could fix it is a ride nobody ever fixes.
  it("keeps an undated ride on the board and says what is missing", async () => {
    state.board = makeBoard({ rides: [makeRide({ scheduledAt: null })] });
    renderBoard();
    expect(await screen.findByText(/no date set/i)).toBeInTheDocument();
    expect(screen.getByText(/no time/i)).toBeInTheDocument();
  });

  // A search that matches every row for "airport" — on an island with
  // one airport — is a search that answers nothing.
  it("searches the things an operator actually has in their hand", async () => {
    state.board = makeBoard({
      rides: [makeRide({ id: "r1" }), makeRide({ id: "r2", guestName: "Luis Wever", bookingRef: "CB-2" })],
    });
    renderBoard();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "CB-2" } });
    expect(screen.getByText("Luis Wever")).toBeInTheDocument();
    expect(screen.queryByText("Marta Vos")).toBeNull();
  });

  // An empty search result is not an empty board, and saying "every ride
  // has a driver" over a typo would be a lie about the board's state.
  it("tells an empty search apart from a covered board", () => {
    renderBoard();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(screen.getByText(/nothing matches that/i)).toBeInTheDocument();
    expect(screen.queryByText(/every ride has a driver/i)).toBeNull();
  });
});
