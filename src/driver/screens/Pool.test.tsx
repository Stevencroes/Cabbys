import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state: { open: unknown[]; error: string | null; claim: unknown } =
  { open: [], error: null, claim: { ok: true, rideId: "r1" } };
const navigate = vi.fn();
let loadCalls = 0;

vi.mock("../lib/driver", () => ({
  loadOpen: () => { loadCalls++; return Promise.resolve({ jobs: state.open, error: state.error }); },
  claimRide: () => Promise.resolve(state.claim),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

import Pool from "./Pool";

const job = (id: string, pickup = "Queen Beatrix International Airport") => ({
  id, status: "confirmed", scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup, dropoff: "The Ritz-Carlton Aruba", vehicle: "The Scout",
  passengers: 3, luggage: 2, childSeats: 0, fare: 67, bookingRef: "CB-1",
});

const renderPool = () => render(<MemoryRouter><Pool /></MemoryRouter>);

beforeEach(() => {
  state.open = [job("r1")];
  state.error = null;
  state.claim = { ok: true, rideId: "r1" };
  navigate.mockClear();
  loadCalls = 0;
});

describe("Open pool", () => {
  it("shows the route and fare but never the guest's identity", async () => {
    renderPool();
    expect(await screen.findByText(/Queen Beatrix International Airport/)).toBeInTheDocument();
    expect(screen.getByText("$67")).toBeInTheDocument();
    // the view withholds these; the card must not invent a place for them
    expect(screen.queryByText(/contact/i)).toBeNull();
    expect(screen.getByText(/no guest names or numbers shown until a job is yours/i)).toBeInTheDocument();
  });

  it("opens the job once it's claimed", async () => {
    renderPool();
    fireEvent.click(await screen.findByRole("button", { name: /accept/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/drive/ride/r1"));
  });

  it("losing the race retires the card quietly — no dialog, no alarm", async () => {
    state.claim = { ok: false, error: "already_taken" };
    renderPool();
    fireEvent.click(await screen.findByRole("button", { name: /accept/i }));

    // the card leaves and the list resyncs, but nothing is raised at the driver
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await waitFor(() => expect(loadCalls).toBeGreaterThan(1), { timeout: 2000 });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("says so plainly when the pool is empty", async () => {
    state.open = [];
    renderPool();
    expect(await screen.findByText(/pool's empty/i)).toBeInTheDocument();
  });

  it("does not call a broken pool an empty one", async () => {
    state.open = [];
    state.error = "permission denied for view open_rides";
    renderPool();
    // the distinction is the whole point: one is normal, the other is a
    // setup problem the driver would otherwise wait out forever
    expect(await screen.findByText(/can't reach the pool/i)).toBeInTheDocument();
    expect(screen.queryByText(/pool's empty/i)).toBeNull();
    expect(screen.getByText(/permission denied for view open_rides/)).toBeInTheDocument();
  });
});
