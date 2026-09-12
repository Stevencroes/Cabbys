import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state: { ride: unknown; status: unknown } = {
  ride: null,
  status: { ok: true },
};
const statusCalls: [string, string][] = [];
const navigate = vi.fn();

vi.mock("../lib/driver", () => ({
  loadRide: () => Promise.resolve(state.ride),
  setRideStatus: (id: string, s: string) => {
    statusCalls.push([id, s]);
    return Promise.resolve(state.status);
  },
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "r1" }),
  useNavigate: () => navigate,
}));

import RideDetail from "./RideDetail";

const ride = (over: Record<string, unknown> = {}) => ({
  id: "r1", status: "driver_assigned", scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup: "Queen Beatrix International Airport", dropoff: "Bucuti & Tara",
  vehicle: "The Voyager", passengers: 4, luggage: 5, childSeats: 1,
  // ƒ104 is the guest's fare; three quarters of it, in dollars, is $43.58
  fareAwg: 104, payoutUsd: (104 / 1.79) * 0.75, bookingRef: "CBY-4417",
  contactName: "Steven Croes", contactPhone: "+2975607336", flightNumber: "KL767",
  pickupLat: 12.55, pickupLng: -70.05, pickupNote: "Blue umbrella, left of the pier",
  bookingNotes: null,
  ...over,
});

const renderDetail = () => render(<MemoryRouter><RideDetail /></MemoryRouter>);

beforeEach(() => {
  state.ride = ride();
  state.status = { ok: true };
  statusCalls.length = 0;
  navigate.mockClear();
});

describe("Ride detail", () => {
  // The screen has said this in its own header since it was written —
  // coordinates get you within 20 metres, the landmark closes the last 20
  // — and rendered the opposite: the note sat under the map, below the
  // fold on a phone. PRECEDING is the note coming FIRST in the DOM.
  it("puts the guest note above the map, because the landmark closes the last 20 metres", async () => {
    renderDetail();
    const note = await screen.findByText(/blue umbrella, left of the pier/i);
    const map = document.querySelector(".drv-pinmap")!;
    expect(map.compareDocumentPosition(note)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    // it's the amber card, set larger than anything else on the screen
    expect(note.closest(".drv-note")).not.toBeNull();
  });

  it("deep-links Maps to the guest's pin, not the place name", async () => {
    renderDetail();
    const maps = await screen.findByRole("link", { name: /open in maps/i });
    expect(maps).toHaveAttribute("href", "https://maps.google.com/?daddr=12.55,-70.05");
  });

  // rides.pickup_lat/lng are columns nothing in this app has ever written
  // — the guest-drops-a-pin flow was specified and never built — so this
  // is not the edge case, it is every ride. The pickup's own name is the
  // best location we hold, and the catalog knows where its places are.
  it("maps the place it was told to collect from when no pin was dropped", async () => {
    state.ride = ride({ pickupLat: null, pickupLng: null, pickupNote: null });
    renderDetail();
    const maps = await screen.findByRole("link", { name: /open in maps/i });
    // the NAME still wins the deep link: Google resolves it to the door,
    // where an area centre would send the driver to the middle of a beach
    expect(maps.getAttribute("href")).toContain("Queen%20Beatrix");
    // and the badge never claims a pin nobody dropped
    expect(await screen.findByText(/approximate — from the address/i)).toBeInTheDocument();
    expect(screen.queryByText(/guest pinned/i)).toBeNull();
  });

  it("says so plainly when it has no idea where the pickup is", async () => {
    state.ride = ride({
      pickup: "A villa with no name", pickupLat: null, pickupLng: null, pickupNote: null,
    });
    renderDetail();
    expect(await screen.findByText(/no location/i)).toBeInTheDocument();
  });

  // "Guest pinned" is a claim about provenance, not about having a map.
  it("reserves the pinned badge for a pin a guest actually dropped", async () => {
    renderDetail();
    expect(await screen.findByText(/guest pinned/i)).toBeInTheDocument();
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

  // This route renders bare — no top bar, no tabs — so before this there
  // was no way off the screen that wasn't finishing the job. A driver who
  // opened a ride they'd claimed for Friday was simply stuck in it.
  it("can be left without completing the job", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /back to the schedule/i }));
    expect(navigate).toHaveBeenCalledWith("/drive");
  });

  // A refused step used to be swallowed whole: setRideStatus returned a
  // bare false, the button un-pressed itself, and the ride stayed put
  // with nothing on screen to explain why.
  it("says why a step was refused instead of looking like a dead button", async () => {
    state.status = { ok: false, detail: "This job isn't yours any more." };
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /i'm on my way/i }));
    expect(await screen.findByText(/this job isn't yours any more/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  // set_ride_status() won't accept 'driver_assigned', so "I'm on my way"
  // is the one tap with no way back — and the screen must not offer an
  // undo the database would refuse.
  it("offers one step back where the database allows one, and not where it doesn't", async () => {
    state.ride = ride({ status: "arrived" });
    const first = renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /undo/i }));
    await waitFor(() => expect(statusCalls).toEqual([["r1", "en_route"]]));
    first.unmount();

    state.ride = ride({ status: "en_route" });
    renderDetail();
    expect(await screen.findByRole("button", { name: /i've arrived/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  // Step3Details has always written this column and nothing has ever read
  // it. A villa pickup's entire usable detail — the typed address, the
  // guest's own note about it, the child seats' ages, the flight's landing
  // time — was sitting in `rides.notes` being ignored.
  it("shows what the booking was told, as facts rather than a paragraph", async () => {
    state.ride = ride({
      bookingNotes:
        "Pickup address: Villa Sunrise 14 (blue gate, past the second speed bump) · area Palm Beach"
        + " · Child seats: 1 (ages 3) · Flight lands 2:35 PM AST · We have a surfboard",
    });
    renderDetail();
    expect(await screen.findByText(/blue gate, past the second speed bump/)).toBeInTheDocument();
    expect(screen.getByText("Child seats: 1 (ages 3)")).toBeInTheDocument();
    expect(screen.getByText("We have a surfboard")).toBeInTheDocument();
    // one per line, not one grey sentence
    expect(document.querySelectorAll(".drv-told li")).toHaveLength(5);
  });

  it("says nothing at all when the booking said nothing", async () => {
    state.ride = ride({ bookingNotes: null });
    renderDetail();
    await screen.findByText("Steven Croes");
    expect(document.querySelector(".drv-told")).toBeNull();
  });

  // The money rows are the other half of the pool's fix: the driver's
  // payout leads, the guest's total is named as the guest's.
  it("leads with the payout and labels the guest's fare as the guest's", async () => {
    renderDetail();
    expect(await screen.findByText("$44")).toBeInTheDocument();  // (104 / 1.79) × 0.75
    expect(screen.getByText("You earn")).toBeInTheDocument();
    expect(screen.getByText(/Guest pays/)).toBeInTheDocument();
  });
});
