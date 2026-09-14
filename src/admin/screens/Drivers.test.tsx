import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "../BoardContext";
import { makeBoard, makeDriver, makeRide } from "../lib/fixtures";

// The directory, and only the directory. Approve, put on hold and the
// five-document review used to open inside this table and now live on
// the driver's own page — their tests moved with them to
// DriverProfile.test.tsx rather than being dropped.
const state: { board: Board } = { board: makeBoard() };
const navigate = vi.fn();

vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

import Drivers from "./Drivers";

const renderList = () => render(<MemoryRouter><Drivers /></MemoryRouter>);

beforeEach(() => {
  state.board = makeBoard({ drivers: [makeDriver()] });
  navigate.mockClear();
});

describe("the driver directory", () => {
  it("shows each driver with the car a guest would be looking for", () => {
    renderList();
    expect(screen.getByText("Ana Croes")).toBeInTheDocument();
    expect(screen.getByText("Black Mercedes V-Class")).toBeInTheDocument();
    expect(screen.getByText("A-12345")).toBeInTheDocument();
  });

  // Progressive disclosure, and the reason this screen was emptied: a
  // panel that opens inside a table moves every row under it, so the
  // operator's eye loses the person they were deciding about at the
  // exact moment they decide.
  it("keeps the decisions off the list and opens the driver instead", () => {
    renderList();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /put on hold/i })).toBeNull();
    fireEvent.click(screen.getByText("Ana Croes").closest("tr")!);
    expect(navigate).toHaveBeenCalledWith("/admin/drivers/d1");
  });

  it("gives every row a real link, so a keyboard can open it too", () => {
    renderList();
    expect(screen.getByRole("link", { name: "Ana Croes" })).toHaveAttribute("href", "/admin/drivers/d1");
  });

  // Waiting first. It is the only row on this screen with a deadline on
  // it: a driver who applied yesterday is sitting outside the portal
  // looking at "Application received" until somebody acts.
  it("puts the drivers who are waiting at the top", () => {
    state.board = makeBoard({
      drivers: [
        makeDriver({ id: "d1", fullName: "Ana Croes", status: "approved" }),
        makeDriver({ id: "d2", fullName: "Luis Wever", status: "pending" }),
      ],
    });
    renderList();
    const names = screen.getAllByRole("link").map((a) => a.textContent);
    expect(names[0]).toBe("Luis Wever");
  });

  // is_online is the only availability flag this database has, so what
  // the driver is DOING comes from their live work rather than from an
  // invented status column.
  it("says what each driver is doing right now, in words", () => {
    state.board = makeBoard({
      drivers: [makeDriver({ id: "d1" })],
      rides: [makeRide({ driverId: "d1", status: "en_route", driverPlate: "A-12345" })],
    });
    renderList();
    expect(screen.getByText("On a ride")).toBeInTheDocument();
  });

  it("calls a driver on hold what they are, rather than merely offline", () => {
    state.board = makeBoard({ drivers: [makeDriver({ status: "suspended" })] });
    renderList();
    expect(screen.getByText("On hold")).toBeInTheDocument();
    expect(screen.getByText(/can't take new work/i)).toBeInTheDocument();
  });

  // A drivers row with no user_id is a record of a person, not an
  // account: every write path in this project keys on the auth id.
  it("says when a row has no account behind it", () => {
    state.board = makeBoard({ drivers: [makeDriver({ id: "" })] });
    renderList();
    expect(screen.getByText(/no account linked/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ana Croes" })).toBeNull();
  });

  it("says so plainly when Cabby's has no drivers at all", () => {
    state.board = makeBoard({ drivers: [] });
    renderList();
    expect(screen.getByText(/no drivers yet/i)).toBeInTheDocument();
  });

  // "drivers: read as admin" is an additive RLS policy; without it the
  // select succeeds and returns zero rows. An operator told "no drivers
  // yet" would go and re-create people who are already there.
  it("does not call an unreadable drivers table an empty one", () => {
    state.board = makeBoard({ drivers: [], driversError: "permission denied for table drivers" });
    renderList();
    expect(screen.getByText(/can't read the drivers/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table drivers/)).toBeInTheDocument();
    expect(screen.queryByText(/no drivers yet/i)).toBeNull();
  });

  // A count that could not be read shows as a sentence rather than as
  // zero: "0 of 5" over an unreadable table sends somebody to chase five
  // documents that are already on file.
  it("shows an unreadable paperwork count as unreadable, not as zero", () => {
    state.board = makeBoard({ drivers: [makeDriver()], docsError: "permission denied for table driver_documents" });
    renderList();
    expect(screen.getByText(/can't read them/i)).toBeInTheDocument();
    expect(screen.queryByText("0 of 5")).toBeNull();
  });

  it("filters by name, number or plate", () => {
    state.board = makeBoard({
      drivers: [makeDriver({ id: "d1", fullName: "Ana Croes" }), makeDriver({ id: "d2", fullName: "Luis Wever", plate: "A-99999" })],
    });
    renderList();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "A-99999" } });
    expect(screen.getByText("Luis Wever")).toBeInTheDocument();
    expect(screen.queryByText("Ana Croes")).toBeNull();
  });
});
