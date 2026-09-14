import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AdminRide } from "./lib/admin";
import type { DriverProfile } from "../driver/lib/driver";
import { makeDriver, makeRide } from "./lib/fixtures";

// These assertions were the /admin/assign screen's. That screen is gone
// — the ride's own page is a better place to put a driver on a ride,
// because the guest, the route, the money and the timeline are all still
// on screen while the choice is made — but every guarantee it carried
// came from the database's own refusals, and those did not move.
const state: { result: unknown } = {
  result: { ok: true, stamped: { name: "Ana Croes", vehicle: "Black Mercedes V-Class", plate: "A-12345" } },
};
const assigned = vi.fn();

vi.mock("./lib/admin", async (orig) => ({
  ...(await orig<typeof import("./lib/admin")>()),
  assignRide: (rideId: string, driverId: string) => {
    assigned(rideId, driverId);
    return Promise.resolve(state.result);
  },
}));

import AssignPanel from "./AssignPanel";

const onAssigned = vi.fn();
const onRefused = vi.fn();

function renderPanel(over: {
  ride?: AdminRide; drivers?: DriverProfile[]; driversError?: string | null; rides?: AdminRide[];
} = {}) {
  const ride = over.ride ?? makeRide();
  return render(
    <MemoryRouter>
      <AssignPanel
        ride={ride}
        drivers={over.drivers ?? [makeDriver()]}
        driversError={over.driversError ?? null}
        rides={over.rides ?? [ride]}
        onAssigned={onAssigned}
        onRefused={onRefused}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.result = { ok: true, stamped: { name: "Ana Croes", vehicle: "Black Mercedes V-Class", plate: "A-12345" } };
  assigned.mockClear();
  onAssigned.mockClear();
  onRefused.mockClear();
});

describe("putting a driver on a ride", () => {
  // admin_assign_ride refuses a driver who isn't approved. A name simply
  // missing from the list is a question that otherwise gets answered in
  // the Supabase dashboard.
  it("offers only approved drivers, and says how many it left out and why", () => {
    renderPanel({
      drivers: [makeDriver({ id: "d1", fullName: "Ana Croes" }), makeDriver({ id: "d2", fullName: "Luis Wever", status: "pending" })],
    });
    expect(screen.getByText("Ana Croes")).toBeInTheDocument();
    expect(screen.queryByText("Luis Wever")).toBeNull();
    expect(screen.getByText(/1 other driver isn't listed/i)).toBeInTheDocument();
    expect(screen.getByText(/refuses a ride handed to them/i)).toBeInTheDocument();
  });

  it("cannot assign until a driver is chosen", () => {
    renderPanel();
    const go = screen.getByRole("button", { name: /assign this ride/i });
    expect(go).toBeDisabled();
    expect(screen.getByText(/pick the driver for this ride/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ana Croes"));
    expect(go).toBeEnabled();
  });

  // The bug this project spent a session fixing, at the moment it could
  // be reintroduced. A driver with nothing on their row assigns fine and
  // stamps nothing, so the guest's booking shows no car at all.
  it("warns that a driver with no car leaves the guest nothing to look for", () => {
    renderPanel({ drivers: [makeDriver({ plate: null, photoUrl: null })] });
    fireEvent.click(screen.getByText("Ana Croes"));
    expect(screen.getByText(/guests can't spot them/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing to look for/i)).toBeInTheDocument();
    // a warning, not a block: the database allows it, so this panel does too
    expect(screen.getByRole("button", { name: /assign this ride/i })).toBeEnabled();
  });

  // The database will happily put one driver on two airport runs half an
  // hour apart. Sometimes that is right; what is never right is doing it
  // without noticing.
  it("warns when the driver is already booked around that hour", () => {
    const ride = makeRide({ id: "r1", scheduledAt: "2026-09-01T19:00:00.000Z" });
    const other = makeRide({ id: "r2", driverId: "d1", status: "driver_assigned", scheduledAt: "2026-09-01T18:35:00.000Z" });
    renderPanel({ ride, rides: [ride, other] });
    fireEvent.click(screen.getByText("Ana Croes"));
    expect(screen.getByText(/they're already on the/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assign this ride/i })).toBeEnabled();
  });

  // What was STAMPED, not what was intended. The five driver_* columns
  // are what a guest reads in My Trips, and for most of this project's
  // life nothing wrote them.
  it("says back the car that was stamped onto the booking", async () => {
    renderPanel();
    fireEvent.click(screen.getByText("Ana Croes"));
    fireEvent.click(screen.getByRole("button", { name: /assign this ride/i }));
    await waitFor(() => expect(assigned).toHaveBeenCalledWith("r1", "d1"));
    expect(onAssigned).toHaveBeenCalledWith(expect.stringMatching(/the guest will see Black Mercedes V-Class · A-12345/i));
  });

  // An assignment that succeeds and stamps nothing is the failure this
  // whole chain exists to catch, and it has to be said at the moment it
  // happens rather than at a kerb.
  it("says so when the assignment landed but stamped no car", async () => {
    state.result = { ok: true, stamped: { name: "Ana Croes", vehicle: null, plate: null } };
    renderPanel();
    fireEvent.click(screen.getByText("Ana Croes"));
    fireEvent.click(screen.getByRole("button", { name: /assign this ride/i }));
    await waitFor(() => expect(onAssigned).toHaveBeenCalled());
    expect(onAssigned).toHaveBeenCalledWith(expect.stringMatching(/no car on record/i));
  });

  // Losing the race to a driver claiming from the pool is an ordinary
  // outcome and has to be readable — an assignment that fails in silence
  // leaves an operator believing a ride is covered when it isn't.
  it("hands back the database's reason when the ride was claimed from under it", async () => {
    state.result = { ok: false, detail: "Somebody already has this ride — a driver may have claimed it from the pool." };
    renderPanel();
    fireEvent.click(screen.getByText("Ana Croes"));
    fireEvent.click(screen.getByRole("button", { name: /assign this ride/i }));
    await waitFor(() => expect(onRefused).toHaveBeenCalledWith(expect.stringMatching(/claimed it from the pool/i)));
  });

  it("does not call an unreadable driver list an empty one", () => {
    renderPanel({ drivers: [], driversError: "permission denied for table drivers" });
    expect(screen.getByRole("alert")).toHaveTextContent(/drivers can't be read/i);
    expect(screen.queryByText(/nobody is approved/i)).toBeNull();
  });

  it("points at the Drivers screen when nobody is approved yet", () => {
    renderPanel({ drivers: [makeDriver({ status: "pending" })] });
    expect(screen.getByText(/nobody is approved to drive/i)).toBeInTheDocument();
    expect(screen.getByText(/1 driver is waiting or on hold/i)).toBeInTheDocument();
  });
});
