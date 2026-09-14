import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Board } from "../BoardContext";
import { makeBoard, makeDriver, makeRide } from "../lib/fixtures";

const state: { board: Board; cancel: unknown; unassign: unknown } = {
  board: makeBoard(),
  cancel: { ok: true, driverName: "Ana Croes", paymentStatus: "authorized" },
  unassign: { ok: true, driverName: "Ana Croes" },
};
const cancelled = vi.fn();
const unassigned = vi.fn();

vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));
vi.mock("../lib/admin", async (orig) => ({
  ...(await orig<typeof import("../lib/admin")>()),
  loadAdminRide: () => Promise.resolve({ ride: null, error: null }),
  cancelRide: (id: string, reason: string) => { cancelled(id, reason); return Promise.resolve(state.cancel); },
  unassignRide: (id: string, reason: string) => { unassigned(id, reason); return Promise.resolve(state.unassign); },
}));

import RideView from "./RideView";

const renderRide = () =>
  render(
    <MemoryRouter initialEntries={["/admin/rides/r1"]}>
      <Routes><Route path="/admin/rides/:id" element={<RideView />} /></Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  state.board = makeBoard({ rides: [makeRide()], drivers: [makeDriver()] });
  state.cancel = { ok: true, driverName: "Ana Croes", paymentStatus: "authorized" };
  state.unassign = { ok: true, driverName: "Ana Croes" };
  cancelled.mockClear();
  unassigned.mockClear();
});

describe("the ride command view", () => {
  // The whole design of the screen: a control the database would refuse
  // is absent, with the reason in its place, rather than sitting there
  // greyed out teaching an operator that buttons mean nothing.
  it("offers the driver picker, and nothing else, on a ride nobody is driving", () => {
    renderRide();
    expect(screen.getByRole("button", { name: /assign this ride/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take it off this driver/i })).toBeNull();
  });

  it("offers taking it off the driver once somebody has it", () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "driver_assigned", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-12345" })],
      drivers: [makeDriver()],
    });
    renderRide();
    expect(screen.getByRole("button", { name: /take it off this driver/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /assign this ride/i })).toBeNull();
  });

  // admin_unassign_ride refuses a ride that has started, because who is
  // driving it is then a question being answered on a road.
  it("will not move a ride that is already under way, and says why", () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "en_route", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-12345" })],
      drivers: [makeDriver()],
    });
    renderRide();
    expect(screen.queryByRole("button", { name: /take it off this driver/i })).toBeNull();
    expect(screen.getByText(/can't be moved to another driver from here/i)).toBeInTheDocument();
    // it can still be called off
    expect(screen.getByRole("button", { name: /cancel this booking/i })).toBeInTheDocument();
  });

  // Un-earning a driven ride rewrites the driver's own Earnings screen
  // under them, which is the one figure they check.
  it("offers nothing at all on a ride that has already been driven", () => {
    state.board = makeBoard({ rides: [makeRide({ status: "completed", driverId: "d1", driverPlate: "A-1" })] });
    renderRide();
    expect(screen.queryByRole("button", { name: /cancel this booking/i })).toBeNull();
    expect(screen.getByText(/rewriting it under them/i)).toBeInTheDocument();
  });

  // The database refuses a cancellation with no reason, so the button
  // is refused here too — and says so, rather than failing at the RPC.
  it("will not cancel without a reason", async () => {
    renderRide();
    fireEvent.click(screen.getByRole("button", { name: /cancel this booking/i }));
    const go = screen.getByRole("button", { name: /yes, cancel it/i });
    expect(go).toBeDisabled();
    expect(screen.getByText(/say why first/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Guest cancelled on WhatsApp" } });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    await waitFor(() => expect(cancelled).toHaveBeenCalledWith("r1", "Guest cancelled on WhatsApp"));
  });

  // The most expensive lie this portal could tell would be implying the
  // cancellation settled the card. It didn't: there is no refund path in
  // this project at all.
  it("says out loud that cancelling does not release the money", async () => {
    renderRide();
    fireEvent.click(screen.getByRole("button", { name: /cancel this booking/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Guest cancelled" } });
    fireEvent.click(screen.getByRole("button", { name: /yes, cancel it/i }));
    expect(await screen.findByText(/void the authorisation in the Stripe dashboard/i)).toBeInTheDocument();
  });

  it("never shows a refund button, because nothing here could honour one", () => {
    renderRide();
    expect(screen.queryByRole("button", { name: /refund/i })).toBeNull();
    expect(screen.getByText(/Money is settled in Stripe, not here/i)).toBeInTheDocument();
  });

  // A roster that changes without a word is how a driver stops trusting
  // it, so the result names who has to be told.
  it("names the driver whose morning just changed", async () => {
    state.board = makeBoard({
      rides: [makeRide({ status: "driver_assigned", driverId: "d1", driverName: "Ana Croes", driverPlate: "A-12345" })],
      drivers: [makeDriver()],
    });
    renderRide();
    fireEvent.click(screen.getByRole("button", { name: /take it off this driver/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Car won't start" } });
    fireEvent.click(screen.getByRole("button", { name: /yes, take it off/i }));
    await waitFor(() => expect(unassigned).toHaveBeenCalledWith("r1", "Car won't start"));
    expect(await screen.findByText(/Ana Croes is off this ride/i)).toBeInTheDocument();
  });

  // A refusal is the database's own sentence, never "something went
  // wrong" — each one names a different next move.
  it("shows the database's reason when a write is refused", async () => {
    state.cancel = { ok: false, detail: "This ride has already been driven, so it can't be cancelled." };
    renderRide();
    fireEvent.click(screen.getByRole("button", { name: /cancel this booking/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "anything" } });
    fireEvent.click(screen.getByRole("button", { name: /yes, cancel it/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already been driven/i);
  });

  // A step with no time against it is a step not reached, never a time
  // that was lost.
  it("draws the timeline from the stamps the database actually wrote", () => {
    state.board = makeBoard({
      rides: [makeRide({
        status: "in_progress", driverId: "d1", driverPlate: "A-1",
        assignedAt: "2026-08-30T12:00:00.000Z", arrivedAt: "2026-09-01T18:30:00.000Z",
        startedAt: "2026-09-01T18:34:00.000Z",
      })],
      drivers: [makeDriver()],
    });
    renderRide();
    expect(screen.getByText("Guest aboard")).toBeInTheDocument();
    expect(screen.getByText("Where it is now")).toBeInTheDocument();
    // completed is drawn but not reached, so it carries no time
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  // The three writers of rides.notes are not the same person, and
  // attributing "Car won't start" to a guest is worse than not showing
  // it at all.
  it("keeps a handback out of the block headed 'what the guest told us'", () => {
    state.board = makeBoard({
      rides: [makeRide({ notes: "2 child seats (ages 3, 6) · Returned to pool: Car won't start" })],
    });
    renderRide();
    expect(screen.getByText("2 child seats (ages 3, 6)")).toBeInTheDocument();
    expect(screen.getByText(/Car won't start/)).toBeInTheDocument();
    expect(screen.getByText("What happened to it")).toBeInTheDocument();
  });

  // The board's own copy is used where it has one; a ride older than the
  // board's window is read directly, and a genuinely missing one is a
  // different sentence from a read that failed.
  it("says a ride is gone rather than pretending the board is broken", async () => {
    state.board = makeBoard({ rides: [] });
    renderRide();
    expect(await screen.findByText(/nothing at/i)).toBeInTheDocument();
    expect(screen.queryByText(/can't read/i)).toBeNull();
  });
});
