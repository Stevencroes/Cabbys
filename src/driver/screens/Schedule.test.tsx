import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { todayInAruba, weekDays, weekdayLong, addDays, arubaInstant } from "../../lib/datetime";

const state: { assigned: unknown[]; completed: unknown[]; cancelled: unknown[]; error: string | null } =
  { assigned: [], completed: [], cancelled: [], error: null };
const navigate = vi.fn();

vi.mock("../lib/driver", async (orig) => ({
  ...(await orig<typeof import("../lib/driver")>()),
  loadAssigned: () => Promise.resolve({ jobs: state.assigned, error: state.error }),
  loadCompleted: () => Promise.resolve({ jobs: state.completed, error: null }),
  loadCancelled: () => Promise.resolve({ jobs: state.cancelled, error: null }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

import Schedule from "./Schedule";

const driver = {
  id: "d1", fullName: "Steven Croes", phone: null, vehicle: null, plate: null,
  status: "approved" as const, rating: 4.9, tripsCount: 12, isOnline: true,
};

const job = (id: string, day: string, time: string, pickup: string) => ({
  id, status: "driver_assigned", scheduledAt: arubaInstant(day, time),
  pickup, dropoff: "The Ritz-Carlton Aruba", vehicle: "The Scout",
  passengers: 2, luggage: 2, childSeats: 0,
  fareAwg: 89.5, payoutUsd: (89.5 / 1.79) * 0.75, bookingRef: "CB-1",
  contactName: null, contactPhone: null, flightNumber: null,
  pickupLat: null, pickupLng: null, pickupNote: null,
});

const week = weekDays(todayInAruba());
const renderSchedule = () => render(<MemoryRouter><Schedule driver={driver} /></MemoryRouter>);

beforeEach(() => {
  state.assigned = [];
  state.completed = [];
  state.cancelled = [];
  state.error = null;
  navigate.mockClear();
});

describe("The weekly roster", () => {
  // The screen this replaced had three buckets — Today, Tomorrow, Later —
  // and "Later" is not a day of the week. A driver asked to take Saturday
  // could not see what Saturday already held.
  it("lays the week out as seven real days, Monday first", async () => {
    renderSchedule();
    const strip = await screen.findByRole("group", { name: /days of the week/i });
    const days = strip.querySelectorAll("button");
    expect(days).toHaveLength(7);
    expect(days[0].getAttribute("aria-label")).toMatch(/^Monday/);
    expect(days[6].getAttribute("aria-label")).toMatch(/^Sunday/);
    // and every one of them says how much work is on it
    expect(days[0].getAttribute("aria-label")).toMatch(/0 jobs/);
  });

  it("files each job on the weekday it is actually driven", async () => {
    state.assigned = [
      job("a", week[0], "09:15", "Queen Beatrix International Airport"),
      job("b", week[4], "18:40", "Bucuti & Tara Beach Resort"),
    ];
    renderSchedule();
    expect(await screen.findByText("Queen Beatrix International Airport")).toBeInTheDocument();
    expect(screen.getByText("Bucuti & Tara Beach Resort")).toBeInTheDocument();

    const strip = screen.getByRole("group", { name: /days of the week/i });
    const days = strip.querySelectorAll("button");
    expect(days[0].getAttribute("aria-label")).toMatch(/1 job$/);
    expect(days[4].getAttribute("aria-label")).toMatch(/1 job$/);
    expect(days[1].getAttribute("aria-label")).toMatch(/0 jobs$/);
  });

  // "Later" could only shrug at a job three weeks out. A calendar can walk
  // to it.
  it("walks to another week and shows the work standing in it", async () => {
    const nextMonday = addDays(week[0], 7);
    state.assigned = [job("c", nextMonday, "11:00", "Arikok National Park")];
    renderSchedule();

    // not in this week
    await waitFor(() => expect(screen.queryByText("Arikok National Park")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /next week/i }));
    expect(await screen.findByText("Arikok National Park")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to this week/i })).toBeInTheDocument();
  });

  it("opens a single day onto its own clock, with the gap between pickups named", async () => {
    state.assigned = [
      job("a", week[2], "08:00", "Queen Beatrix International Airport"),
      job("b", week[2], "14:30", "Bucuti & Tara Beach Resort"),
    ];
    renderSchedule();
    const strip = await screen.findByRole("group", { name: /days of the week/i });
    fireEvent.click(strip.querySelectorAll("button")[2]);

    expect(await screen.findByText(weekdayLong(week[2]), { exact: false })).toBeInTheDocument();
    expect(screen.getByText("8:00 AM")).toBeInTheDocument();
    expect(screen.getByText("2:30 PM")).toBeInTheDocument();
    expect(screen.getByText(/6h 30m between pickups/)).toBeInTheDocument();
  });

  // An empty Thursday is information, not an absence of it.
  it("says a day is clear rather than leaving it blank", async () => {
    state.assigned = [job("a", week[0], "09:15", "Queen Beatrix International Airport")];
    renderSchedule();
    const strip = await screen.findByRole("group", { name: /days of the week/i });
    fireEvent.click(strip.querySelectorAll("button")[3]);
    expect(await screen.findByText(/the day is clear|nothing was driven/i)).toBeInTheDocument();
  });

  // A ride cancelled under a driver used to leave their world without a
  // word — loadAssigned filtered it out and nothing else asked. On the
  // morning of a 6am airport run that is indistinguishable from the
  // roster being wrong, and a driver who trusts the roster drives to the
  // airport for a ride called off the night before.
  it("says out loud when a ride still ahead has been cancelled", async () => {
    state.cancelled = [
      { ...job("x", week[5], "06:00", "Queen Beatrix International Airport"), status: "cancelled",
        scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
    ];
    renderSchedule();
    expect(await screen.findByRole("alert")).toHaveTextContent(/a ride was cancelled/i);
    expect(screen.getByText(/don't drive to it/i)).toBeInTheDocument();
  });

  // Behind them it is history, not an alarm — but it still has to be on
  // the roster rather than absent from it, or the day reads as a gap
  // nobody can explain.
  it("keeps a cancelled ride on the day, and out of the day's count", async () => {
    state.assigned = [job("a", week[2], "08:00", "Queen Beatrix International Airport")];
    state.cancelled = [
      { ...job("b", week[2], "14:30", "Bucuti & Tara Beach Resort"), status: "cancelled" },
    ];
    renderSchedule();
    expect(await screen.findByText("Bucuti & Tara Beach Resort")).toBeInTheDocument();
    expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThan(0);

    const strip = screen.getByRole("group", { name: /days of the week/i });
    // one job that day, not two: a cancelled ride is shown, never counted
    expect(strip.querySelectorAll("button")[2].getAttribute("aria-label")).toMatch(/1 job$/);
  });

  it("does not call an unreadable schedule an empty one", async () => {
    state.error = "permission denied for table rides";
    renderSchedule();
    expect(await screen.findByText(/can't read your schedule/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table rides/)).toBeInTheDocument();
    expect(screen.queryByText(/nothing booked this week/i)).toBeNull();
  });
});
