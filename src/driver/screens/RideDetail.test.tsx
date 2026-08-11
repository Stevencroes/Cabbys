import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state: { ride: unknown; setOk: boolean } = { ride: null, setOk: true };
const statusCalls: [string, string][] = [];

vi.mock("../lib/driver", () => ({
  loadRide: () => Promise.resolve(state.ride),
  setRideStatus: (id: string, s: string) => {
    statusCalls.push([id, s]);
    return Promise.resolve(state.setOk);
  },
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "r1" }),
  useNavigate: () => vi.fn(),
}));

import RideDetail from "./RideDetail";

const ride = (over: Record<string, unknown> = {}) => ({
  id: "r1", status: "driver_assigned", scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup: "Queen Beatrix International Airport", dropoff: "Bucuti & Tara",
  vehicle: "The Voyager", passengers: 4, luggage: 5, childSeats: 1,
  fare: 58, bookingRef: "CBY-4417",
  contactName: "Steven Croes", contactPhone: "+2975607336", flightNumber: "KL767",
  pickupLat: 12.55, pickupLng: -70.05, pickupNote: "Blue umbrella, left of the pier",
  ...over,
});

const renderDetail = () => render(<MemoryRouter><RideDetail /></MemoryRouter>);

beforeEach(() => { state.ride = ride(); state.setOk = true; statusCalls.length = 0; });

describe("Ride detail", () => {
  it("puts the guest note above the map, because the landmark closes the last 20 metres", async () => {
    renderDetail();
    const note = await screen.findByText(/blue umbrella, left of the pier/i);
    const map = document.querySelector(".drv-pinmap")!;
    // Node.DOCUMENT_POSITION_FOLLOWING — the note comes after the map in
    // the DOM, meaning it renders below it… which is what we do NOT want
    expect(map.compareDocumentPosition(note)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // it's the amber card, set larger than anything else on the screen
    expect(note.closest(".drv-note")).not.toBeNull();
  });

  it("deep-links Maps to the guest's pin, not the place name", async () => {
    renderDetail();
    const maps = await screen.findByRole("link", { name: /open in maps/i });
    expect(maps).toHaveAttribute("href", "https://maps.google.com/?daddr=12.55,-70.05");
  });

  it("falls back to the place name when no pin was dropped", async () => {
    state.ride = ride({ pickupLat: null, pickupLng: null, pickupNote: null });
    renderDetail();
    const maps = await screen.findByRole("link", { name: /open in maps/i });
    expect(maps.getAttribute("href")).toContain("Queen%20Beatrix");
    expect(await screen.findByText(/no pin yet/i)).toBeInTheDocument();
  });

  it("walks the status forward one step per tap", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /i'm on my way/i }));
    await waitFor(() => expect(statusCalls).toEqual([["r1", "en_route"]]));
  });

  it("names the next action for each status in the flow", async () => {
    for (const [status, label] of [
      ["en_route", /i've arrived/i],
      ["arrived", /guest is aboard/i],
      ["in_progress", /complete trip/i],
    ] as const) {
      state.ride = ride({ status });
      const { unmount } = renderDetail();
      expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the guest's contact only because this ride is already theirs", async () => {
    renderDetail();
    expect(await screen.findByText("Steven Croes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /call steven croes/i })).toHaveAttribute("href", "tel:+2975607336");
  });
});
