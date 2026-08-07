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
    // the time picker is three explicit controls — no 24h guessing, and a
    // partial selection can never reach state
    fireEvent.change(screen.getByLabelText(/flight lands at — hour/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/flight lands at — minute/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/flight lands at — AM or PM/i), { target: { value: "PM" } });
    // the derived moment that sells the service
    expect(await screen.findByText(/Your driver waits from 2:35 PM/)).toBeInTheDocument();

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

  it("puts the reason under the field it belongs to, wired for a screen reader (Phase 4)", () => {
    function BareOpener() {
      const { open, setField } = useBooking();
      return <button onClick={() => { open(); setField("from", null); }}>launch</button>;
    }
    render(
      <BookingProvider>
        <BareOpener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    fireEvent.click(screen.getByRole("button", { name: /your details/i }));

    // the sentence is announced, not just a red border
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/tell us where to pick you up first/i);

    // and the control points at it, so the reason is read with the field
    const pickup = screen.getByRole("combobox", { name: /pick up/i });
    expect(pickup).toHaveAttribute("aria-invalid", "true");
    expect(pickup).toHaveAttribute("aria-describedby", alert.id);
    expect(alert.id).toBeTruthy();
  });

  it("refuses a return date that precedes the outbound date (Phase 4)", () => {
    function ReturnOpener() {
      const { open, setField } = useBooking();
      return (
        <button
          onClick={() => {
            open({
              from: selFromPlace(placeById("ritz")!),
              to: selFromPlace(AIRPORT),
              date: "2026-09-10",
              pax: 2,
            });
            setField("journey", "return");
            setField("depTime", "14:00");
            // the way back, a day before the way out
            setField("returnDate", "2026-09-09");
            setField("returnTime", "10:00");
          }}
        >
          launch
        </button>
      );
    }
    render(
      <BookingProvider>
        <ReturnOpener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    fireEvent.click(screen.getByRole("button", { name: /your details/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/can't be before Thu 10 Sep 2026/i);
    // still on step 1 — the contact fields never appear
    expect(screen.queryByLabelText(/name for the driver's sign/i)).toBeNull();
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
