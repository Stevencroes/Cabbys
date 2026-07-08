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
  time: "14:30",
  vehicle: "premium",
  total: 84.8,
  paid: false,
  flightNumber: "AA1234",
  contactName: "Ada Lovelace",
};

describe("Confirmation", () => {
  it("renders the ticket with ref, route, flight promise and next steps", () => {
    render(
      <MemoryRouter>
        <BookingProvider>
          <Confirmation booking={booking} />
        </BookingProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("CB-7KM4Q")).toBeInTheDocument();
    expect(screen.getByText(/Queen Beatrix International Airport/)).toBeInTheDocument();
    expect(screen.getByText(/AA1234 — tracked/)).toBeInTheDocument();
    expect(screen.getByText("Driver assigned")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add to calendar/i })).toBeInTheDocument();
    // Reserve mode → settle on the day, and the traveler is greeted by name.
    expect(screen.getByText(/pay on the day/i)).toBeInTheDocument();
    expect(screen.getByText(/Ada, your/)).toBeInTheDocument();
  });

  it("renders nothing without a booking", () => {
    const { container } = render(
      <MemoryRouter>
        <BookingProvider>
          <Confirmation booking={null} />
        </BookingProvider>
      </MemoryRouter>,
    );
    expect(container.querySelector(".conf-screen")).toBeNull();
  });
});
