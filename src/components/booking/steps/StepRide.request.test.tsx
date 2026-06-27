import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../booking/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "a@b.com" },
    loading: false,
    signInWithProvider: vi.fn(),
    signInWithEmail: vi.fn(),
  }),
}));
vi.mock("../../../booking/useFare", () => ({
  useFare: () => ({ loading: false, fare: { source: "route" }, base: 40, tax: 2.4, total: 42.4, lineItems: [] }),
  fareForVehicle: () => 42.4,
}));
// Self-contained factory (no external vars — avoids vi.mock hoisting/TDZ).
// `from` supports both the pricing chain (.select().eq().order().then) and rides .insert().
vi.mock("../../../lib/supabase", () => {
  const make = () => {
    const b: any = {
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "ride-1" }, error: null }) }) }),
      select() { return b; },
      eq() { return b; },
      order() { return b; },
      then(res: any) { return Promise.resolve({ data: [], error: null }).then(res); },
    };
    return b;
  };
  return { supabase: { from: () => make() } };
});

import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepRide from "./StepRide";

function Seed() {
  const { setField } = useBooking();
  return (
    <button
      onClick={() => {
        setField("from", "Queen Beatrix International Airport");
        setField("to", "Palm Beach");
        setField("date", "2026-07-01");
        setField("time", "14:00");
        setField("vehicle", "sedan");
      }}
    >
      seed
    </button>
  );
}

describe("StepRide — request", () => {
  it("writes a rides row and reports the id on request", async () => {
    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Seed />
        <StepRide onConfirmed={onConfirmed} />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("seed"));
    fireEvent.click(screen.getByRole("button", { name: /request ride/i }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ rideId: "ride-1" })));
  });
});
