import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Self-contained supabase stub: pricing queries resolve empty (the km model
// prices), rides insert succeeds, guest session resolves.
// Step 2 fills its contact fields from the profile. Signed out by default,
// which is what every other test in this file assumes.
const auth: { account: Record<string, unknown> | null } = { account: null };
vi.mock("../../booking/useAuth", () => ({
  useAuth: () => ({ account: auth.account, user: auth.account, loading: false }),
}));

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

/**
 * The time picker is one trigger over a popover now. A flight lands at
 * 14:05, which is not a quarter hour, so these go through the exact row —
 * the reason that row exists.
 */
function setExactTime(triggerName: RegExp, hhmm: string) {
  fireEvent.click(screen.getByRole("button", { name: triggerName }));
  fireEvent.change(screen.getByLabelText(/exact time/i), { target: { value: hhmm } });
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
    setExactTime(/flight lands at/i, "14:05");
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

  it("carries the profile into step 2 rather than asking for it again", async () => {
    auth.account = {
      id: "u1", email: "greta@example.com",
      user_metadata: { full_name: "Greta Croes", phone: "+2971234567" },
    };
    try {
      render(
        <BookingProvider>
          <Opener />
          <BookingOverlay />
        </BookingProvider>,
      );
      fireEvent.click(screen.getByText("launch"));
      setExactTime(/flight lands at/i, "14:05");
      fireEvent.click(screen.getByRole("button", { name: /your details/i }));

      expect(await screen.findByLabelText(/name for the driver's sign/i)).toHaveValue("Greta Croes");
      expect(screen.getByLabelText(/whatsapp \/ phone/i)).toHaveValue("+2971234567");

      // and it is a prefill, not a lock: whoever is travelling may not be you
      const name = screen.getByLabelText(/name for the driver's sign/i);
      fireEvent.change(name, { target: { value: "Someone Else" } });
      expect(name).toHaveValue("Someone Else");
    } finally {
      auth.account = null;
    }
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

  it("drops the reason the moment the field it names is filled in", async () => {
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));

    // Blocked on an empty landing time — three controls, none of them set.
    fireEvent.click(screen.getByRole("button", { name: /your details/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/when does your flight land/i);
    expect(screen.getByRole("button", { name: /flight lands at/i })).toHaveAttribute("aria-invalid", "true");

    // Fill all three. The confirmation copy proves the value is valid, so the
    // red outline and the sentence under it have stopped being true.
    // 2 PM is on the quarter-hour grid: pick the band, tap the time
    fireEvent.click(screen.getByRole("button", { name: /flight lands at/i }));
    fireEvent.click(screen.getByRole("tab", { name: /afternoon/i }));
    fireEvent.click(screen.getByRole("button", { name: "2:00 PM" }));

    expect(await screen.findByText(/Your driver waits from 2:30 PM/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: /flight lands at/i })).not.toHaveAttribute("aria-invalid");
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
