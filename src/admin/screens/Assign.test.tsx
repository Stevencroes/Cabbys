import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { DriverProfile } from "../../driver/lib/driver";
import type { AdminRide } from "../lib/admin";

const state: {
  rides: AdminRide[];
  ridesError: string | null;
  drivers: DriverProfile[];
  driversError: string | null;
  result: unknown;
} = {
  rides: [], ridesError: null, drivers: [], driversError: null,
  result: { ok: true, stamped: { name: "Ana Croes", vehicle: "Black Mercedes V-Class", plate: "A-12345" } },
};
const assigned = vi.fn();

vi.mock("../lib/admin", async (orig) => ({
  ...(await orig<typeof import("../lib/admin")>()),
  loadUpcomingRides: () => Promise.resolve({ rides: state.rides, error: state.ridesError }),
  loadAllDrivers: () => Promise.resolve({ drivers: state.drivers, error: state.driversError }),
  assignRide: (rideId: string, driverId: string) => {
    assigned(rideId, driverId);
    return Promise.resolve(state.result);
  },
}));

import Assign from "./Assign";

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

const driver = (over: Partial<DriverProfile> = {}): DriverProfile => ({
  id: "d1",
  fullName: "Ana Croes",
  email: null,
  phone: "+297 560 1234",
  vehicle: null,
  plate: "A-12345",
  make: "Mercedes",
  model: "V-Class",
  colour: "Black",
  year: 2024,
  seats: 6,
  bags: 5,
  photoUrl: "https://example.test/face.jpg",
  status: "approved",
  rating: 4.9,
  tripsCount: 128,
  isOnline: false,
  ...over,
});

const renderAssign = (path = "/admin/assign") =>
  render(<MemoryRouter initialEntries={[path]}><Assign /></MemoryRouter>);

beforeEach(() => {
  state.rides = [ride()];
  state.ridesError = null;
  state.drivers = [driver()];
  state.driversError = null;
  state.result = { ok: true, stamped: { name: "Ana Croes", vehicle: "Black Mercedes V-Class", plate: "A-12345" } };
  assigned.mockClear();
});

describe("Assign", () => {
  // admin_assign_ride matches on `driver_id is null and status in
  // ('confirmed','pending')`. Listing anything else would be offering a
  // control the database has already decided to refuse.
  it("lists only rides nobody has claimed", async () => {
    state.rides = [
      ride({ id: "r1" }),
      ride({ id: "r2", driverId: "dx", status: "driver_assigned", dropoff: "Bucuti & Tara Beach Resort" }),
      ride({ id: "r3", status: "cancelled", dropoff: "Boca Catalina" }),
    ];
    renderAssign();
    expect(await screen.findByText(/The Ritz-Carlton Aruba/)).toBeInTheDocument();
    expect(screen.queryByText(/Bucuti & Tara Beach Resort/)).toBeNull();
    expect(screen.queryByText(/Boca Catalina/)).toBeNull();
  });

  // Same rule, the other side of it: the function refuses a driver who
  // isn't approved. A name simply missing from the list is a question
  // that otherwise gets answered in the Supabase dashboard.
  it("offers only approved drivers, and says how many it left out and why", async () => {
    state.drivers = [
      driver({ id: "d1", fullName: "Ana Croes" }),
      driver({ id: "d2", fullName: "Luis Wever", status: "pending" }),
    ];
    renderAssign();
    expect(await screen.findByText("Ana Croes")).toBeInTheDocument();
    expect(screen.queryByText("Luis Wever")).toBeNull();
    expect(screen.getByText(/1 other driver isn't listed/i)).toBeInTheDocument();
    expect(screen.getByText(/refuses a ride handed to them/i)).toBeInTheDocument();
  });

  // "Put a driver on this one" is the move an operator makes from the
  // board. Landing them on a list they have to search again is how the
  // wrong ride gets assigned.
  it("opens on the ride the board sent it", async () => {
    state.rides = [ride({ id: "r1" }), ride({ id: "r2", dropoff: "Boca Catalina" })];
    renderAssign("/admin/assign?ride=r2");
    fireEvent.click(await screen.findByText("Ana Croes"));
    expect(screen.getByText(/Boca Catalina/, { selector: ".proute" })).toBeInTheDocument();
    expect(screen.getByText(/Ana Croes takes/)).toHaveTextContent(/Boca Catalina/);
  });

  it("cannot assign until both halves are chosen", async () => {
    renderAssign();
    const go = await screen.findByRole("button", { name: /assign this ride/i });
    expect(go).toBeDisabled();
    expect(screen.getByText(/pick a ride on the left and a driver on the right/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/The Ritz-Carlton Aruba/));
    expect(screen.getByText(/pick the driver for this ride/i)).toBeInTheDocument();
    expect(go).toBeDisabled();

    fireEvent.click(screen.getByText("Ana Croes"));
    expect(go).toBeEnabled();
  });

  // The bug this project spent a session fixing, at the moment it could
  // be reintroduced. A driver with nothing on their row assigns fine and
  // stamps nothing, so the guest's booking shows no car at all.
  it("warns that a driver with no car leaves the guest nothing to look for", async () => {
    state.drivers = [driver({ plate: null, photoUrl: null })];
    renderAssign();
    fireEvent.click(await screen.findByText(/The Ritz-Carlton Aruba/));
    fireEvent.click(screen.getByText("Ana Croes"));
    expect(screen.getByText(/guests can't spot them/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing to look for/i)).toBeInTheDocument();
    // a warning, not a block: the database allows it, so this screen does too
    expect(screen.getByRole("button", { name: /assign this ride/i })).toBeEnabled();
  });

  // The database will happily put one driver on two airport runs half an
  // hour apart. Sometimes that is right; what is never right is doing it
  // without noticing.
  it("warns when the driver is already booked around that hour", async () => {
    state.rides = [
      ride({ id: "r1", scheduledAt: "2026-09-01T19:00:00.000Z" }),
      ride({ id: "r2", driverId: "d1", status: "driver_assigned", scheduledAt: "2026-09-01T18:35:00.000Z" }),
    ];
    renderAssign();
    fireEvent.click(await screen.findByText(/The Ritz-Carlton Aruba/));
    fireEvent.click(screen.getByText("Ana Croes"));
    expect(screen.getByText(/they're already on the/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assign this ride/i })).toBeEnabled();
  });

  // What was STAMPED, not what was intended. The five driver_* columns
  // are what a guest reads in My Trips, and for most of this project's
  // life nothing wrote them.
  it("says back the car that was stamped onto the booking", async () => {
    renderAssign();
    fireEvent.click(await screen.findByText(/The Ritz-Carlton Aruba/));
    fireEvent.click(screen.getByText("Ana Croes"));
    fireEvent.click(screen.getByRole("button", { name: /assign this ride/i }));
    await waitFor(() => expect(assigned).toHaveBeenCalledWith("r1", "d1"));
    expect(await screen.findByText(/the guest will see Black Mercedes V-Class · A-12345/i)).toBeInTheDocument();
  });

  // Losing the race to a driver claiming from the pool is an ordinary
  // outcome and has to be readable — an assignment that fails in silence
  // leaves an operator believing a ride is covered when it isn't.
  it("shows the database's reason when the ride was claimed from under it", async () => {
    state.result = { ok: false, detail: "Somebody already has this ride — a driver may have claimed it from the pool." };
    renderAssign();
    fireEvent.click(await screen.findByText(/The Ritz-Carlton Aruba/));
    fireEvent.click(screen.getByText("Ana Croes"));
    fireEvent.click(screen.getByRole("button", { name: /assign this ride/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/a driver may have claimed it from the pool/i);
  });

  it("says so plainly when every ride already has a driver", async () => {
    state.rides = [ride({ driverId: "dx", status: "driver_assigned" })];
    renderAssign();
    expect(await screen.findByText(/every ride has a driver/i)).toBeInTheDocument();
  });

  // Two panes, two reads, two ways to fail — and neither may be reported
  // as the other's empty state.
  it("does not call an unreadable board an empty one", async () => {
    state.rides = [];
    state.ridesError = "permission denied for table rides";
    renderAssign();
    expect(await screen.findByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table rides/)).toBeInTheDocument();
    expect(screen.queryByText(/every ride has a driver/i)).toBeNull();
  });

  it("does not call an unreadable driver list an empty one", async () => {
    state.drivers = [];
    state.driversError = "permission denied for table drivers";
    renderAssign();
    expect(await screen.findByText(/can't read the drivers/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table drivers/)).toBeInTheDocument();
    expect(screen.queryByText(/nobody is approved/i)).toBeNull();
  });
});
