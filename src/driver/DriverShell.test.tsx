import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state: { online: boolean; assigned: unknown[] } = { online: true, assigned: [] };
const calls: boolean[] = [];
const navigate = vi.fn();

vi.mock("./lib/driver", async (orig) => ({
  ...(await orig<typeof import("./lib/driver")>()),
  setOnline: (next: boolean) => { calls.push(next); return Promise.resolve(state.online); },
  loadAssigned: () => Promise.resolve({ jobs: state.assigned, error: null }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
vi.mock("./useRideOffers", () => ({
  useRideOffers: () => ({
    offer: null, missed: null, busy: false, refused: null,
    accept: () => Promise.resolve(null), dismiss: () => {}, clearMissed: () => {},
  }),
}));
vi.mock("./lib/chime", () => ({ primeAudio: () => {}, chime: () => Promise.resolve() }));

import DriverShell from "./DriverShell";

const driver = {
  id: "d1", fullName: "Steven Croes", email: "ana@example.com", phone: null, vehicle: null, plate: null,
  status: "approved" as const, rating: 4.9, tripsCount: 12, isOnline: false,
};

const renderShell = () =>
  render(<MemoryRouter><DriverShell driver={driver}><p>screen</p></DriverShell></MemoryRouter>);

const job = (status: string) => ({
  id: "r9", status, scheduledAt: new Date().toISOString(),
  pickup: "Queen Beatrix International Airport", dropoff: "Bucuti & Tara Beach Resort",
  vehicle: "The Scout", passengers: 2, luggage: 1, childSeats: 0,
  fareAwg: 128, payoutUsd: 53, bookingRef: "CBY-1",
  contactName: null, contactPhone: null, flightNumber: null,
  pickupLat: null, pickupLng: null, pickupNote: null, bookingNotes: null,
  arrivedAt: null, startedAt: null,
});

beforeEach(() => {
  state.online = true;
  state.assigned = [];
  calls.length = 0;
  navigate.mockClear();
});

describe("The driver shell", () => {
  it("flips the switch before the write lands, because a switch that waits feels broken", async () => {
    renderShell();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(calls).toEqual([true]));
  });

  // The portal reading "Online" over a database row that says otherwise is
  // a driver sitting out a whole shift wondering where the work went.
  it("puts the switch back and says so when the write doesn't land", async () => {
    state.online = false;  // the update failed
    renderShell();
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach cabby's/i);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("names the first tab for what it now shows", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute("href", "/drive");
  });

  // A driver who checked their earnings mid-ride, or whose phone reloaded
  // at a red light, had no way back to the job except hunting the roster —
  // on the one screen where thirty seconds costs the most.
  it("keeps a job in flight one tap away from anywhere", async () => {
    state.assigned = [job("en_route")];
    renderShell();
    const bar = await screen.findByRole("button", { name: /on my way/i });
    fireEvent.click(bar);
    expect(navigate).toHaveBeenCalledWith("/drive/ride/r9");
  });

  it("says nothing when the next job is still hours off", async () => {
    state.assigned = [job("driver_assigned")];
    renderShell();
    await waitFor(() => expect(screen.queryByText(/assigned/i)).toBeNull());
  });
});
