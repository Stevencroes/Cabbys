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
const insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "ride-1" }, error: null }) }) }));
vi.mock("../../../lib/supabase", () => ({ supabase: { from: vi.fn(() => ({ insert })) } }));

import { supabase } from "../../../lib/supabase";
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepConfirm from "./StepConfirm";

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

describe("StepConfirm", () => {
  it("writes a rides row and reports the id on confirm", async () => {
    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Seed />
        <StepConfirm onConfirmed={onConfirmed} />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("seed"));
    fireEvent.click(screen.getByRole("button", { name: /^confirm/i }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ rideId: "ride-1" })));
    expect(supabase.from).toHaveBeenCalledWith("rides");
  });
});
