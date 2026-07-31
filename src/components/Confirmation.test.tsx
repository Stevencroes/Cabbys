import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BookingProvider } from "../booking/BookingContext";
import Confirmation from "./Confirmation";

const booking = {
  rideId: "9f3c2a1e-77aa-4bde-9c11-52e6d0aa91aa",
  bookingRef: "CB-7KM4Q",
  from: "Queen Beatrix International Airport",
  to: "The Ritz-Carlton Aruba",
  date: "2026-07-20",
  time: "14:35",
  vehicle: "premium",
  total: 58, // USD — the only currency in the UI
  paid: false,
  flightNumber: "AA1234",
  contactName: "Ada Lovelace",
};

describe("Confirmation", () => {
  it("renders the v3 tag with ref, route, derived pickup and USD fare", () => {
    render(
      <MemoryRouter>
        <BookingProvider>
          <Confirmation booking={booking} />
        </BookingProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("CB-7KM4Q")).toBeInTheDocument();
    expect(screen.getByText(/Queen Beatrix International Airport →/)).toBeInTheDocument();
    expect(screen.getByText("14:35")).toBeInTheDocument();
    expect(screen.getByText("$58")).toBeInTheDocument();
    expect(screen.getByText(/AA1234 — tracked/)).toBeInTheDocument();
    expect(screen.getByText(/Arrivals hall, AUA/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add to calendar/i })).toBeInTheDocument();
    // flight moves → we move with it (only promised when a flight exists)
    expect(screen.getByText(/if it moves, we move with it/i)).toBeInTheDocument();
  });

  it("renders nothing without a booking", () => {
    const { container } = render(
      <MemoryRouter>
        <BookingProvider>
          <Confirmation booking={null} />
        </BookingProvider>
      </MemoryRouter>,
    );
    expect(container.querySelector(".conf")).toBeNull();
  });
});
