import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepPayment from "./StepPayment";

// ── Supabase mock (factory must be self-contained — no outer variables) ────────
vi.mock("../../../lib/supabase", () => {
  const single = vi.fn().mockResolvedValue({ data: { id: "ride-1" }, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { supabase: { from } };
});

// ── useAuth mock ──────────────────────────────────────────────────────────────
vi.mock("../../../booking/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-abc", email: "test@example.com" },
    loading: false,
  }),
}));

// ── useFare mock ──────────────────────────────────────────────────────────────
vi.mock("../../../booking/useFare", () => ({
  useFare: () => ({
    loading: false,
    base: 40,
    tax: 2.4,
    total: 42.4,
    lineItems: [{ label: "Base fare", amount: 40 }],
  }),
}));

// ── Import after mocks to get the spy references ─────────────────────────────
import { supabase } from "../../../lib/supabase";

// ── Harness: sets up booking state at step 7 ──────────────────────────────────
function Harness({ onConfirmed }: { onConfirmed?: (b: unknown) => void }) {
  const { open, goTo, setField } = useBooking();
  React.useEffect(() => {
    open("airport");
    goTo(7);
    setField("from", "Queen Beatrix International Airport");
    setField("to", "Palm Beach");
    setField("date", "2026-06-26");
    setField("time", "14:00");
    setField("passengers", 2);
    setField("luggage", 2);
    setField("vehicle", "sedan");
    setField("signedIn", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <StepPayment onConfirmed={onConfirmed} />;
}

describe("StepPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire the chain after clearAllMocks
    const single = vi.fn().mockResolvedValue({ data: { id: "ride-1" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert });
  });

  it("renders the reserve-now card with reassurance copy", () => {
    render(
      <BookingProvider>
        <Harness />
      </BookingProvider>
    );
    expect(screen.getByText(/no charge today/i)).toBeInTheDocument();
  });

  it("calls supabase.from('rides') on confirm and triggers onConfirmed with rideId", async () => {
    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Harness onConfirmed={onConfirmed} />
      </BookingProvider>
    );

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("rides");
      expect(onConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({ rideId: "ride-1" })
      );
    });
  });

  it("falls back to core payload if withCoords insert errors", async () => {
    // Each call to from() returns fresh insert/select/single chain
    const singleFail = vi.fn().mockResolvedValue({ data: null, error: { message: "geo error" } });
    const singleOk = vi.fn().mockResolvedValue({ data: { id: "ride-2" }, error: null });

    const selectFail = vi.fn(() => ({ single: singleFail }));
    const selectOk = vi.fn(() => ({ single: singleOk }));

    const insertFail = vi.fn(() => ({ select: selectFail }));
    const insertOk = vi.fn(() => ({ select: selectOk }));

    (supabase.from as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ insert: insertFail })
      .mockReturnValueOnce({ insert: insertOk });

    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Harness onConfirmed={onConfirmed} />
      </BookingProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledTimes(2);
      expect(onConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({ rideId: "ride-2" })
      );
    });
  });

  it("shows an error message when both inserts fail", async () => {
    const singleErr = vi.fn().mockResolvedValue({ data: null, error: { message: "db unavailable" } });
    const selectErr = vi.fn(() => ({ single: singleErr }));
    const insertErr = vi.fn(() => ({ select: selectErr }));
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert: insertErr });

    render(
      <BookingProvider>
        <Harness />
      </BookingProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/db unavailable/i)).toBeInTheDocument();
    });
  });
});
