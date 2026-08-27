import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Self-contained supabase stub: pricing queries resolve empty (the km model
// prices), rides insert succeeds, guest session resolves.
// The details step fills its contact fields from the profile. Signed out by
// default, which is what every other test in this file assumes.
//
// No VITE_STRIPE_PUBLISHABLE_KEY is set under test, so the payment step is
// not part of the flow here and Review is where it ends — see
// BookingOverlay.payment.test.tsx for the four-step shape.
//
// Every Opener below stands in for the card on the home page: it fills the
// route, the day and the hour, because nothing can reach the flow without
// them (useStartBooking). The flow itself never asks for any of the three.
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
  const { open, setField } = useBooking();
  return (
    <button
      onClick={() => {
        // the card asks an airport pickup for its LANDING time, not a
        // pickup time — the driver's moment is worked out from it
        setField("flightLanding", "14:05");
        open({
          from: selFromPlace(AIRPORT),
          to: selFromPlace(placeById("ritz")!),
          date: "2026-09-01",
          pax: 2,
        });
      }}
    >
      launch
    </button>
  );
}

/** A round trip to the airport, as the card would hand it over: the leg
    out is timed off the departure, and the way back is what the flow asks. */
function ReturnOpener() {
  const { open, setField } = useBooking();
  return (
    <button
      onClick={() => {
        setField("depTime", "14:00");
        setField("journey", "return");
        // the way back, a day before the way out
        setField("returnDate", "2026-09-09");
        setField("returnTime", "10:00");
        open({
          from: selFromPlace(placeById("ritz")!),
          to: selFromPlace(AIRPORT),
          date: "2026-09-10",
          pax: 2,
        });
      }}
    >
      launch
    </button>
  );
}

/** The primary button is named for the screen it opens, so walking the flow
    reads the way the traveller does: the car, then you, then a look at it. */
const next = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));
const toDetails = () => next(/^your details$/i);
const toReview = () => next(/^review$/i);

describe("BookingOverlay — the booking flow", () => {
  it("books a guest ride end to end in reserve mode", async () => {
    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay onConfirmed={onConfirmed} />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));

    // Step 1 — one question. The route, the day and the hour arrived with
    // the card, and not one of them is on this screen.
    expect(screen.getByText(/Who's coming/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /flight lands at/i })).toBeNull();
    expect(screen.getByRole("radio", { name: /Premium Van/ })).toBeInTheDocument();

    // Continue is never disabled; nothing here can block it
    toDetails();

    // Step 2 — the flight, then who the driver is looking for. The derived
    // moment that sells the service reads back from the card's landing time.
    expect(screen.getByText(/Who are we/)).toBeInTheDocument();
    expect(await screen.findByText(/Your driver waits from 2:35 PM/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/name for the driver's sign/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/whatsapp \/ phone/i), { target: { value: "+1 555 123 4567" } });
    toReview();

    // Step 3 — a last look, with the same total the bar has been showing
    expect(screen.getByText(/Does this look/)).toBeInTheDocument();
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

  it("stops the child seats at two — a third belongs in a second car", () => {
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));

    const seats = () => screen.getByText("Child seats").closest(".stw") as HTMLElement;
    const plus = () => within(seats()).getByRole("button", { name: "+" });
    fireEvent.click(plus());
    fireEvent.click(plus());
    expect(within(seats()).getByText("2")).toBeInTheDocument();
    // and there is no way to ask for a third
    expect(plus()).toBeDisabled();
  });

  it("carries the profile into the details step rather than asking for it again", async () => {
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
      toDetails();

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

  it("names the step in words and fills the line to match", async () => {
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));

    // the numeral is its own span, so read the row rather than a text node
    const label = () => document.querySelector(".bstep")!;
    const fill = () => document.querySelector<HTMLElement>(".bprog-fill")!.style.width;
    expect(label()).toHaveTextContent("Step one of three · Your car");
    // the fill is derived from the step, not hardcoded
    expect(fill()).toBe("33%");

    toDetails();

    await waitFor(() => expect(label()).toHaveTextContent("Step two of three · Your details"));
    expect(fill()).toBe("67%");

    fireEvent.change(screen.getByLabelText(/name for the driver's sign/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/whatsapp \/ phone/i), { target: { value: "+1 555 123 4567" } });
    toReview();
    await waitFor(() => expect(label()).toHaveTextContent("Step three of three · Review"));
    expect(fill()).toBe("100%");
  });

  it("walks back a step at a time, and the car survives the trip", async () => {
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));

    // a car that is not the default, so going back and forth can lose it
    fireEvent.click(screen.getByRole("radio", { name: /Luxury SUV/ }));
    expect(screen.getByRole("radio", { name: /Luxury SUV/ })).toHaveAttribute("aria-checked", "true");
    // step 1 is the first step: there is nowhere further back to go inside
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();

    toDetails();
    expect(await screen.findByLabelText(/name for the driver's sign/i)).toBeInTheDocument();

    // Back is one step, not out of the modal
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Luxury SUV/ })).toHaveAttribute("aria-checked", "true"));
  });

  it("keeps the step indicator a status rather than a control", () => {
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    // the old two-tab header offered something that looked pressable
    expect(screen.queryByRole("tab")).toBeNull();
    expect(document.querySelector(".bprog")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveClass("bstep");
    // and the way out is still the same handler, still named Close
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
  });

  it("lets Escape close a picker without closing the whole booking", () => {
    render(
      <BookingProvider>
        <ReturnOpener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    toDetails();
    fireEvent.click(screen.getByRole("button", { name: /return flight lands/i }));
    expect(screen.getByRole("dialog", { name: /return flight lands/i })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog", { name: /return flight lands/i }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /return flight lands/i })).toBeNull();
    // the ride survives the dismissal
    expect(screen.getByRole("button", { name: /return flight lands/i })).toBeInTheDocument();
  });

  it("puts the reason under the field it belongs to, wired for a screen reader (Phase 4)", () => {
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    toDetails();
    toReview();

    // the sentence is announced, not just a red border
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/a name lets the driver hold the right sign/i);

    // and the control points at it, so the reason is read with the field
    const name = screen.getByLabelText(/name for the driver's sign/i);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", alert.id);
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
    toDetails();
    toReview();
    expect(screen.getByRole("alert")).toHaveTextContent(/a name lets the driver/i);

    fireEvent.change(screen.getByLabelText(/name for the driver's sign/i), { target: { value: "Ada Lovelace" } });
    // the NEXT gap is not promoted to the screen — nobody has walked into it
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByLabelText(/name for the driver's sign/i)).not.toHaveAttribute("aria-invalid");
  });

  it("refuses a return date that precedes the outbound date (Phase 4)", () => {
    render(
      <BookingProvider>
        <ReturnOpener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    toDetails();
    toReview();

    expect(screen.getByRole("alert")).toHaveTextContent(/can't be before Thu 10 Sep 2026/i);
    // still on the details step — the review never appears
    expect(screen.queryByText(/Does this look/)).toBeNull();
  });

  it("blocks with a reason instead of a disabled button", () => {
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));
    toDetails();
    const cont = screen.getByRole("button", { name: /^review$/i });
    expect(cont).toBeEnabled();
    fireEvent.click(cont);
    expect(screen.getByText(/a name lets the driver hold the right sign/i)).toBeInTheDocument();
  });
});
