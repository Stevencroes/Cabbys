import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../booking/useAuth", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: "user-123", email: "test@example.com" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

// Self-contained factory — vi.mock is hoisted, so no outer references.
vi.mock("../lib/supabase", () => {
  const day = 86400000;
  const now = Date.now();
  const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  // One ride per bucket, plus a second upcoming to prove the sort order.
  const rows = [
    { id: "r-far", booking_ref: "CB-FAR", pickup_location: "Palm Beach",
      dropoff_location: "Flying Fishbone", scheduled_date: dateOf(now + 9 * day),
      scheduled_time: "19:00", fare_total: 100, status: "confirmed" },
    { id: "r-soon", booking_ref: "CB-SOON", pickup_location: "Queen Beatrix Airport",
      dropoff_location: "Manchebo Beach Resort", scheduled_date: dateOf(now + 2 * day),
      scheduled_time: "14:35", fare_total: 100, status: "driver_assigned" },
    { id: "r-cancelled", booking_ref: "CB-CANX", pickup_location: "Eagle Beach Hotel",
      dropoff_location: "Palm Beach Marriott", scheduled_date: dateOf(now + 5 * day),
      scheduled_time: "09:15", fare_total: 100, status: "cancelled" },
    { id: "r-done", booking_ref: "CB-DONE", pickup_location: "Oranjestad",
      dropoff_location: "Arikok National Park", scheduled_date: dateOf(now - 8 * day),
      scheduled_time: "10:00", fare_total: 100, status: "completed" },
  ];
  const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eqMock = vi.fn().mockReturnValue({ order: orderMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });
  return {
    supabase: {
      from: fromMock,
      channel: undefined,
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
      },
    },
  };
});

import MyTrips from "./MyTrips";
import { BookingProvider } from "../booking/BookingContext";

// MyTrips lives inside the BookingProvider in the real app — rebooking
// hands the route to the booking flow.
function renderTrips(path = "/trips") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BookingProvider>
        <MyTrips />
      </BookingProvider>
    </MemoryRouter>,
  );
}

const tab = (name: RegExp) => screen.getByRole("button", { name });
const refs = () => [...document.querySelectorAll(".tp-ref")].map((n) => n.textContent);

describe("MyTrips", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers one shelf at a time, with a count on each chip", async () => {
    renderTrips();
    expect(await screen.findByText("CB-SOON")).toBeInTheDocument();

    const picker = screen.getByRole("group", { name: /which trips to show/i });
    expect(
      [...picker.querySelectorAll("button")].map((b) => b.textContent),
    ).toEqual(["Upcoming2", "Cancelled1", "Past1"]);
  });

  it("opens on Upcoming and shows only those trips, soonest first", async () => {
    renderTrips();
    expect(await screen.findByText("CB-SOON")).toBeInTheDocument();

    expect(refs()).toEqual(["CB-SOON", "CB-FAR"]);
    expect(tab(/^upcoming/i)).toHaveAttribute("aria-pressed", "true");
    // a cancelled trip never shows under Upcoming, even with a future date
    expect(screen.queryByText("CB-CANX")).toBeNull();
    expect(screen.queryByText("CB-DONE")).toBeNull();
  });

  it("switches shelves when a chip is chosen", async () => {
    renderTrips();
    expect(await screen.findByText("CB-SOON")).toBeInTheDocument();

    fireEvent.click(tab(/^cancelled/i));
    expect(refs()).toEqual(["CB-CANX"]);
    expect(screen.queryByText("CB-SOON")).toBeNull();

    fireEvent.click(tab(/^past/i));
    expect(refs()).toEqual(["CB-DONE"]);
    expect(screen.queryByText("CB-CANX")).toBeNull();
  });

  it("honours the shelf named in the URL", async () => {
    renderTrips("/trips?show=past");
    expect(await screen.findByText("CB-DONE")).toBeInTheDocument();
    expect(refs()).toEqual(["CB-DONE"]);
    expect(tab(/^past/i)).toHaveAttribute("aria-pressed", "true");
  });

  it("offers rebooking behind you, cancelling ahead of you", async () => {
    renderTrips();
    expect(await screen.findByText("CB-SOON")).toBeInTheDocument();
    // upcoming: cancel, no rebook
    expect(screen.getAllByRole("button", { name: /cancel trip/i })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /book (return|again)/i })).toBeNull();

    fireEvent.click(tab(/^past/i));
    expect(screen.getByRole("button", { name: /book return/i })).toBeInTheDocument();

    fireEvent.click(tab(/^cancelled/i));
    expect(screen.getByRole("button", { name: /book again/i })).toBeInTheDocument();
  });
});
