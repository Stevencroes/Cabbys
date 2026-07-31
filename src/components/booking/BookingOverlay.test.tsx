import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Self-contained supabase stub: pricing queries resolve empty (the km model
// prices), rides insert succeeds, guest session resolves.
vi.mock("../../lib/supabase", () => {
  const make = () => {
    const b: {
      insert: (payload: Record<string, unknown>) => unknown;
      select: () => unknown; eq: () => unknown; order: () => unknown;
      then: (res: (v: unknown) => unknown) => Promise<unknown>;
    } = {
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: "ride-9", booking_ref: payload.booking_ref ?? "CB-TEST9" }, error: null }),
        }),
      }),
      select() { return b; }, eq() { return b; }, order() { return b; },
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

import { BookingProvider, useBooking } from "../../booking/BookingContext";
import BookingOverlay from "./BookingOverlay";
import { placeById, selFromPlace, AIRPORT } from "../../data/places";

function Opener() {
  const { open } = useBooking();
  return (
    <button
      onClick={() =>
        open({
          from: selFromPlace(AIRPORT),
          to: selFromPlace(placeById("ritz")!),
          date: "2026-09-01",
          pax: 2,
        })
      }
    >
      launch
    </button>
  );
}

describe("BookingOverlay — the two-step booking", () => {
  it("books a guest ride end to end in reserve mode", async () => {
    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay onConfirmed={onConfirmed} />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));

    // Step 1 — airport pickup asks for the flight, not the dispatch maths
    expect(screen.getByText(/Landing in/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/flight lands at/i), { target: { value: "14:05" } });
    // the derived moment that sells the service
    expect(await screen.findByText(/Your driver waits from 14:35/)).toBeInTheDocument();

    // Continue is never disabled; with a complete ride it advances
    fireEvent.click(screen.getByRole("button", { name: /your details/i }));

    // Step 2 — review shows the same total the bar shows, then the guest
    expect(screen.getByText(/Confirm and/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/name for the driver's sign/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/whatsapp \/ phone/i), { target: { value: "+1 555 123 4567" } });

    fireEvent.click(screen.getByRole("button", { name: /reserve your car/i }));
    await waitFor(() =>
      expect(onConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({
          rideId: "ride-9",
          paid: false,
          time: "14:35", // derived, not asked
          flightNumber: undefined,
        }),
      ),
    );
  });

  it("blocks with a reason instead of a disabled button", () => {
    function BareOpener() {
      const { open, setField } = useBooking();
      return (
        <button onClick={() => { open(); setField("from", null); }}>launch</button>
      );
    }
    render(
      <BookingProvider>
        <BareOpener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    const cont = screen.getByRole("button", { name: /your details/i });
    expect(cont).toBeEnabled();
    fireEvent.click(cont);
    expect(screen.getByText(/tell us where to pick you up first/i)).toBeInTheDocument();
  });
});
