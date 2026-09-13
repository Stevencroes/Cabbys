import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DriverProfile } from "../../driver/lib/driver";

const state: {
  drivers: DriverProfile[];
  error: string | null;
  write: unknown;
} = { drivers: [], error: null, write: { ok: true, heldRides: 0 } };
const wrote = vi.fn();

vi.mock("../lib/admin", () => ({
  loadAllDrivers: () => Promise.resolve({ drivers: state.drivers, error: state.error }),
  setDriverStatus: (uid: string, status: string) => {
    wrote(uid, status);
    return Promise.resolve(state.write);
  },
}));

import Drivers from "./Drivers";

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

beforeEach(() => {
  state.drivers = [driver()];
  state.error = null;
  state.write = { ok: true, heldRides: 0 };
  wrote.mockClear();
});

describe("Drivers", () => {
  // The car is composed colour-first, the way a guest scanning a kerb
  // reads it, and it is the same composition claim_ride() stamps onto a
  // ride. If the board showed one thing and the stamp another, this
  // screen would be no better than the SQL prompt it replaces.
  it("shows each driver with the car a guest would be looking for", async () => {
    render(<Drivers />);
    expect(await screen.findByText("Ana Croes")).toBeInTheDocument();
    expect(screen.getByText("Black Mercedes V-Class")).toBeInTheDocument();
    expect(screen.getByText("A-12345")).toBeInTheDocument();
    expect(screen.getByText("+297 560 1234")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("4.9")).toBeInTheDocument();
  });

  // Never show a control the database will refuse. Approving an already
  // approved driver writes a row and reports success, which teaches an
  // operator that the button means nothing.
  it("does not offer to approve a driver who is already approved", async () => {
    render(<Drivers />);
    await screen.findByText("Ana Croes");
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /put on hold/i })).toBeInTheDocument();
  });

  it("does not offer to suspend a driver who is already on hold", async () => {
    state.drivers = [driver({ status: "suspended" })];
    render(<Drivers />);
    await screen.findByText("Ana Croes");
    expect(screen.queryByRole("button", { name: /put on hold/i })).toBeNull();
    expect(screen.getByRole("button", { name: /reinstate/i })).toBeInTheDocument();
  });

  it("asks before a status change, and says what it will do", async () => {
    state.drivers = [driver({ status: "pending" })];
    render(<Drivers />);
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    expect(screen.getByText(/approve this driver\?/i)).toBeInTheDocument();
    expect(screen.getByText(/will be able to claim jobs straight away/i)).toBeInTheDocument();
    // nothing has been written yet — the question is not the answer
    expect(wrote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /yes, approve/i }));
    await waitFor(() => expect(wrote).toHaveBeenCalledWith("d1", "approved"));
  });

  // The fault this project spent a whole session fixing, caught one step
  // earlier. claim_ride() stamps whatever the drivers row holds onto the
  // ride; a driver approved with nothing on their row produces bookings
  // that show the guest no car, and nobody finds out until somebody is
  // standing outside arrivals.
  it("warns, before approving, that a driver with no car leaves guests nothing to look for", async () => {
    state.drivers = [driver({ status: "pending", plate: null, photoUrl: null })];
    render(<Drivers />);
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    expect(screen.getByText(/still missing a plate and a photo/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing to look for at the kerb/i)).toBeInTheDocument();
    // a warning, not a block — the database allows it and so does this screen
    expect(screen.getByRole("button", { name: /yes, approve/i })).toBeEnabled();
  });

  // Suspending deliberately does NOT strip a driver's work: a ride
  // silently unassigned at 5am is a guest waiting for a car nobody is
  // driving. But if the consequence is never said, it is invisible until
  // the guest calls.
  it("says how many rides a suspended driver still holds", async () => {
    state.write = { ok: true, heldRides: 2 };
    render(<Drivers />);
    fireEvent.click(await screen.findByRole("button", { name: /put on hold/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, put on hold/i }));
    expect(await screen.findByText(/still hold 2 rides/i)).toBeInTheDocument();
    expect(screen.getByText(/check rides if somebody else should drive them/i)).toBeInTheDocument();
  });

  // A write that fails silently is indistinguishable from a dead button,
  // and this is the one button in the product that replaces a SQL
  // statement — an operator who can't tell will go back to the dashboard.
  it("shows the database's own reason when a change is refused", async () => {
    state.write = { ok: false, detail: "There's no driver record for that account — it may have been removed." };
    render(<Drivers />);
    fireEvent.click(await screen.findByRole("button", { name: /put on hold/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, put on hold/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no driver record for that account/i);
  });

  it("says so plainly when Cabby's has no drivers at all", async () => {
    state.drivers = [];
    render(<Drivers />);
    expect(await screen.findByText(/no drivers yet/i)).toBeInTheDocument();
  });

  // The distinction the whole codebase is built around. "drivers: read
  // as admin" is an additive policy from docs/admin-schema.sql; without
  // it the select succeeds and returns nothing. An operator told "no
  // drivers yet" would go and re-create people who are already there.
  it("does not call an unreadable drivers table an empty one", async () => {
    state.drivers = [];
    state.error = "permission denied for table drivers";
    render(<Drivers />);
    expect(await screen.findByText(/can't read the drivers/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table drivers/)).toBeInTheDocument();
    expect(screen.queryByText(/no drivers yet/i)).toBeNull();
  });

  // Waiting drivers are the only rows on this screen with a deadline:
  // they are sitting outside the portal reading "Application received"
  // until somebody here acts.
  it("puts the drivers who are waiting at the top", async () => {
    state.drivers = [
      driver({ id: "a", fullName: "Approved Person", status: "approved" }),
      driver({ id: "b", fullName: "Waiting Person", status: "pending" }),
    ];
    render(<Drivers />);
    await screen.findByText("Waiting Person");
    const names = screen.getAllByText(/Person$/).map((n) => n.textContent);
    expect(names[0]).toBe("Waiting Person");
    expect(screen.getByText(/1 waiting on approval/i)).toBeInTheDocument();
  });
});
