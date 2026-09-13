import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { driverPayoutUsd, usdToAwg } from "../../lib/quote";

const state: { rides: unknown[] } = { rides: [] };
const asked: number[] = [];
const navigate = vi.fn();

vi.mock("../lib/driver", async (orig) => ({
  ...(await orig<typeof import("../lib/driver")>()),
  loadCompleted: (_id: string, limit: number) => {
    asked.push(limit);
    return Promise.resolve({ jobs: state.rides.slice(0, limit), error: null });
  },
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

import History from "./History";

const driver = {
  id: "d1", fullName: "Ana Croes", email: "ana@example.com", phone: null, vehicle: null, plate: null,
  status: "approved" as const, rating: 4.9, tripsCount: 210, isOnline: false,
};

const ride = (id: string, isoDay: string, retailUsd: number, to: string) => {
  const awg = usdToAwg(retailUsd);
  return {
    id, status: "completed",
    scheduledAt: `${isoDay}T14:00:00.000Z`, completedAt: `${isoDay}T14:40:00.000Z`,
    pickup: "Queen Beatrix International Airport", dropoff: to,
    vehicle: "The Scout", passengers: 2, luggage: 1, childSeats: 0,
    fareAwg: awg, payoutUsd: driverPayoutUsd(awg), bookingRef: `CBY-${id}`,
    contactName: "Amelia Ross", contactPhone: null, flightNumber: null,
    pickupLat: null, pickupLng: null, pickupNote: null,
  };
};

const renderHistory = () => render(<MemoryRouter><History driver={driver} /></MemoryRouter>);

beforeEach(() => {
  // newest first, the way loadCompleted returns them
  state.rides = [
    ride("a", "2026-08-14", 100, "Arikok National Park"),
    ride("b", "2026-08-03", 60, "Eagle Beach"),
    ride("c", "2026-07-28", 40, "Palm Beach"),
  ];
  asked.length = 0;
  navigate.mockClear();
});

describe("History", () => {
  // A dispute is about a period. "August" has to be a line on the screen,
  // with August's own count and August's own money on it.
  it("bands the rides by month, each with its own count and total", async () => {
    renderHistory();
    expect(await screen.findByText("August 2026")).toBeInTheDocument();
    expect(screen.getByText("July 2026")).toBeInTheDocument();
    // $75 + $45 of driver's cut in August, $30 in July
    const august = screen.getByText("August 2026").closest(".drv-band")!;
    expect(august.textContent).toContain("2");
    expect(august.textContent).toContain("$120");
    const july = screen.getByText("July 2026").closest(".drv-band")!;
    expect(july.textContent).toContain("$30");
  });

  // They arrive knowing a place, not a date — "that Arikok run".
  it("finds a trip by where it went, not only by when", async () => {
    renderHistory();
    await screen.findByText(/Arikok National Park/);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "arikok" } });
    expect(screen.getByText(/Arikok National Park/)).toBeInTheDocument();
    expect(screen.queryByText(/Palm Beach/)).toBeNull();
    // and the totals follow the search, or they are answering a question
    // nobody asked
    expect(screen.getByText("Trips found")).toBeInTheDocument();
  });

  // A full drawer and a missed search are different facts.
  it("does not call a missed search an empty history", async () => {
    renderHistory();
    await screen.findByText(/Arikok National Park/);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "boca catalina" } });
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
    expect(screen.queryByText(/no trips yet/i)).toBeNull();
  });

  it("opens the ride behind a row", async () => {
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: /Arikok National Park/ }));
    expect(navigate).toHaveBeenCalledWith("/drive/ride/a");
  });

  // A list that just stops is a list a driver has to guess the end of —
  // which is the difference between "I was never paid" and "I scrolled".
  it("says when it has reached the bottom", async () => {
    renderHistory();
    expect(await screen.findByText(/that's every trip you've completed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show earlier/i })).toBeNull();
  });

  it("offers more when a full page came back, and asks for a deeper one", async () => {
    state.rides = Array.from({ length: 60 }, (_, i) =>
      ride(`r${i}`, "2026-08-14", 60, "Eagle Beach"));
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: /show earlier trips/i }));
    await waitFor(() => expect(asked).toEqual([60, 120]));
  });
});
