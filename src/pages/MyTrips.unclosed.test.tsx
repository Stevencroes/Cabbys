import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../booking/useAuth", () => {
  // One object, returned every render: the real hook hands back the same
  // user reference, and an effect keyed on it must not re-fire.
  const account = { id: "user-123", email: "test@example.com" };
  return { useAuth: () => ({ user: account, account, loading: false, signOut: vi.fn() }) };
});

// One trip, three days gone, still tagged driver_assigned — the shape the QA
// pass found under "Past" and read as a filter bug.
vi.mock("../lib/supabase", () => {
  const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const rows = [{
    id: "r-stale", booking_ref: "CB-STALE", pickup_location: "Palm Beach",
    dropoff_location: "Queen Beatrix Airport", scheduled_date: past,
    scheduled_time: "08:00", fare_total: 100, status: "driver_assigned",
  }];
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  return {
    supabase: {
      from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
      channel: undefined,
      // claim_guest_rides(): this browser has nothing to claim
      rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    },
  };
});

import MyTrips from "./MyTrips";
import { BookingProvider } from "../booking/BookingContext";

describe("MyTrips — a trip nobody closed off", () => {
  it("files it by date and says why, instead of claiming a live status", async () => {
    render(
      <MemoryRouter initialEntries={["/trips"]}>
        <BookingProvider><MyTrips /></BookingProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("CB-STALE")).toBeInTheDocument();
    // it sits under Past, where the date puts it
    expect(screen.getByRole("button", { name: /past/i })).toHaveAttribute("aria-pressed", "true");
    // and the card admits the gap rather than leaving it to be read as a bug
    expect(screen.getByText(/never marked complete/i)).toBeInTheDocument();
    // no live timeline on a trip that is behind you
    expect(document.querySelector(".tp-timeline")).toBeNull();
  });
});
