import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AdminRide } from "../lib/admin";

const state: { rides: AdminRide[]; error: string | null } = { rides: [], error: null };
const navigate = vi.fn();

vi.mock("../lib/admin", async (orig) => ({
  ...(await orig<typeof import("../lib/admin")>()),
  loadUpcomingRides: () => Promise.resolve({ rides: state.rides, error: state.error }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

import Rides from "./Rides";

const ride = (over: Partial<AdminRide> = {}): AdminRide => ({
  id: "r1",
  status: "confirmed",
  scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup: "Queen Beatrix International Airport",
  dropoff: "The Ritz-Carlton Aruba",
  vehicle: "The Scout",
  passengers: 3,
  luggage: 2,
  childSeats: 0,
  // ƒ89.50 is what the guest pays — $50, not the driver's $37.50 cut
  fareAwg: 89.5,
  bookingRef: "CB-1",
  guestName: "Marta Vos",
  guestPhone: "+31 6 1234 5678",
  flightNumber: null,
  driverId: null,
  driverName: null,
  driverVehicle: null,
  driverPlate: null,
  ...over,
});

const renderBoard = () => render(<MemoryRouter><Rides /></MemoryRouter>);

beforeEach(() => {
  state.rides = [ride()];
  state.error = null;
  navigate.mockClear();
});

describe("Rides board", () => {
  // A booking with no driver is the only row here that will not resolve
  // itself: an assigned ride runs, a cancelled one is over, and an
  // unassigned one just gets closer to its pickup time. So it is where
  // the board opens.
  it("opens on the rides nobody is driving", async () => {
    state.rides = [ride({ id: "r1" }), ride({ id: "r2", driverId: "d1", status: "driver_assigned", driverName: "Ana Croes", driverPlate: "A-12345" })];
    renderBoard();
    expect(await screen.findByRole("button", { name: /needs a driver/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /put a driver on/i })).toBeInTheDocument();
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

  it("carries the ride through to the assign screen rather than leaving it to be found again", async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /put a driver on/i }));
    expect(navigate).toHaveBeenCalledWith("/admin/assign?ride=r1");
  });

  // admin_assign_ride refuses a cancelled or completed ride. A button
  // that exists only to be refused is worse than no button — this says
  // why instead.
  it("does not offer to assign a ride the database would refuse", async () => {
    state.rides = [ride({ status: "cancelled" })];
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /done or called off/i }));
    expect(screen.queryByRole("button", { name: /put a driver on/i })).toBeNull();
    expect(screen.getByText(/nobody drove this — it was called off/i)).toBeInTheDocument();
  });

  // The bug claim_ride() was fixed for, seen from the operator's side: a
  // ride can have a driver and still show the guest nothing, because the
  // five driver_* columns are what My Trips reads.
  it("says when an assigned ride shows the guest no car", async () => {
    state.rides = [ride({ driverId: "d1", status: "driver_assigned", driverName: "Ana Croes" })];
    renderBoard();
    fireEvent.click(await screen.findByRole("button", { name: /with a driver/i }));
    expect(screen.getByText(/no car shown to the guest/i)).toBeInTheDocument();
  });

  it("says so plainly when nothing is booked from today on", async () => {
    state.rides = [];
    renderBoard();
    expect(await screen.findByText(/nothing booked from today on/i)).toBeInTheDocument();
  });

  // "No unassigned rides" is the best news on this screen and "the board
  // is empty" is a different fact entirely. Reading the first as the
  // second is how somebody concludes bookings have stopped arriving.
  it("tells an empty filter apart from an empty board", async () => {
    state.rides = [ride({ driverId: "d1", status: "driver_assigned", driverName: "Ana Croes" })];
    renderBoard();
    expect(await screen.findByText(/every ride has a driver/i)).toBeInTheDocument();
    expect(screen.getByText(/all 1 booking from today on are covered/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing booked from today on/i)).toBeNull();
  });

  // Bookings keep arriving while the board cannot see them. An operator
  // who reads a failed read as a quiet day will not go looking.
  it("does not call an unreadable board a quiet day", async () => {
    state.rides = [];
    state.error = "permission denied for table rides";
    renderBoard();
    expect(await screen.findByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table rides/)).toBeInTheDocument();
    expect(screen.queryByText(/nothing booked from today on/i)).toBeNull();
  });

  // A ride with no date is broken, and a broken ride hidden from the one
  // screen that could fix it is a ride nobody ever fixes.
  it("keeps an undated ride on the board and says what is missing", async () => {
    state.rides = [ride({ scheduledAt: null })];
    renderBoard();
    expect(await screen.findByText(/no date set/i)).toBeInTheDocument();
    expect(screen.getByText(/no time/i)).toBeInTheDocument();
  });
});
