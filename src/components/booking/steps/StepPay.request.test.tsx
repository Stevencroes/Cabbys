import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../booking/useFare", () => ({
  useFare: () => ({
    loading: false,
    fare: { source: "route", total: 40, base: 40, lineItems: [{ label: "Airport → Palm Beach", amount: 40, kind: "base", note: "Fixed route" }] },
    base: 40,
    tax: 2.4,
    total: 42.4,
    lineItems: [{ label: "Airport → Palm Beach", amount: 40, kind: "base", note: "Fixed route" }],
  }),
  fareForVehicle: () => 42.4,
}));
// Self-contained factory (no external vars — avoids vi.mock hoisting/TDZ).
vi.mock("../../../lib/supabase", () => {
  const make = () => {
    const b: {
      insert: () => unknown;
      select: () => unknown;
      eq: () => unknown;
      order: () => unknown;
      then: (res: (v: unknown) => unknown) => Promise<unknown>;
    } = {
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "ride-1", booking_ref: "CB-TEST2" }, error: null }),
        }),
      }),
      select() { return b; },
      eq() { return b; },
      order() { return b; },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
    };
    return b;
  };
  return {
    supabase: {
      from: () => make(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInAnonymously: () => Promise.resolve({ data: { user: { id: "anon-1" } }, error: null }),
      },
    },
  };
});

import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepPay from "./StepPay";

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
        setField("contactName", "Ada Lovelace");
        setField("contactPhone", "+1 555 123 4567");
        setField("flightNumber", "aa 1234");
      }}
    >
      seed
    </button>
  );
}

describe("StepPay — reserve flow (no Stripe key)", () => {
  it("writes a rides row as guest checkout and reports the booking", async () => {
    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Seed />
        <StepPay onConfirmed={onConfirmed} />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("seed"));
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));
    await waitFor(() =>
      expect(onConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({
          rideId: "ride-1",
          bookingRef: "CB-TEST2",
          paid: false,
          flightNumber: "AA1234",
        }),
      ),
    );
  });
});
