import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// Mock useAuth to return a signed-in user
vi.mock("../booking/useAuth", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: "user-123", email: "test@example.com" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

// Mock supabase so rides query resolves two test rows
vi.mock("../lib/supabase", () => {
  const orderMock = vi.fn().mockResolvedValue({
    data: [
      {
        id: "r1",
        pickup_location: "Queen Beatrix Airport",
        dropoff_location: "Manchebo Beach Resort",
        scheduled_date: "2026-08-01",
        scheduled_time: "10:00",
        vehicle_type: "Sedan",
        vehicle_class: "Business",
        fare_total: 120,
        status: "confirmed",
        created_at: "2026-07-01T10:00:00Z",
      },
      {
        id: "r2",
        pickup_location: "Eagle Beach Hotel",
        dropoff_location: "Palm Beach Marriott",
        scheduled_date: "2026-08-05",
        scheduled_time: "14:30",
        vehicle_type: "SUV",
        vehicle_class: "First Class",
        fare_total: 200,
        status: "pending",
        created_at: "2026-07-02T10:00:00Z",
      },
    ],
    error: null,
  });
  const eqMock = vi.fn().mockReturnValue({ order: orderMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });
  return {
    supabase: {
      from: fromMock,
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

describe("MyTrips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders both trip route strings when user is signed in", async () => {
    render(
      <MemoryRouter>
        <MyTrips />
      </MemoryRouter>
    );

    // Wait for async data load and assert both pickup → dropoff routes appear
    expect(
      await screen.findByText(/Queen Beatrix Airport/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Manchebo Beach Resort/i)).toBeInTheDocument();
    expect(screen.getByText(/Eagle Beach Hotel/i)).toBeInTheDocument();
    expect(screen.getByText(/Palm Beach Marriott/i)).toBeInTheDocument();
  });
});
