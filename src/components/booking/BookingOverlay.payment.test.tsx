// The four-step flow — the shape the site actually ships with.
//
// STRIPE_KEY is read once, at module scope, so this file stubs the env and
// then imports the overlay dynamically. Its sibling BookingOverlay.test.tsx
// covers the no-key case, where Review is the last step and the fare is
// settled with the driver instead.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../booking/useAuth", () => ({
  useAuth: () => ({ account: null, user: null, loading: false }),
}));

/** Flipped on to make the ride insert fail once, so the retry path is real. */
const rideInsert = { fails: false };

vi.mock("../../lib/supabase", () => {
  const make = () => {
    const b: {
      insert: (p: Record<string, unknown>) => unknown;
      select: () => unknown; eq: () => unknown; order: () => unknown;
      then: (res: (v: unknown) => unknown) => Promise<unknown>;
    } = {
      insert: (p: Record<string, unknown>) => ({
        select: () => ({
          single: () => Promise.resolve(rideInsert.fails
            ? { data: null, error: { message: "network" } }
            : { data: { id: "ride-9", booking_ref: p.booking_ref ?? "CB-TEST9" }, error: null }),
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

// A card field that records where it was mounted, so the test can prove the
// step put one on screen without loading Stripe.js.
const mounted: HTMLElement[] = [];
const element = { mount: (n: HTMLElement) => { mounted.push(n); } };
const elements = { create: () => element, getElement: () => null };
const confirmPayment = vi.fn(async () => ({ error: undefined }));
vi.mock("../../lib/stripe", () => ({
  getStripe: async () => ({ elements: () => elements, confirmPayment }),
}));

import { BookingProvider, useBooking } from "../../booking/BookingContext";
import { placeById, selFromPlace, AIRPORT } from "../../data/places";

type OverlayType = typeof import("./BookingOverlay").default;
let BookingOverlay: OverlayType;

beforeAll(async () => {
  vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "pk_test_stub");
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ clientSecret: "cs_test_stub" }),
  })));
  // rAF is what the card field is mounted on; run it straight away
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 0; });
  BookingOverlay = (await import("./BookingOverlay")).default;
});
afterAll(() => vi.unstubAllEnvs());

function Opener() {
  const { open } = useBooking();
  return (
    <button onClick={() => open({
      from: selFromPlace(AIRPORT),
      to: selFromPlace(placeById("ritz")!),
      date: "2026-09-01",
      pax: 2,
    })}>launch</button>
  );
}

const next = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));

function fillContact() {
  fireEvent.change(screen.getByLabelText(/name for the driver's sign/i), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText(/whatsapp \/ phone/i), { target: { value: "+1 555 123 4567" } });
}

describe("BookingOverlay — four steps, with a card at the end", () => {
  it("walks car → details → review → payment, and never asks for the route", async () => {
    const onConfirmed = vi.fn();
    render(
      <BookingProvider>
        <Opener />
        <BookingOverlay onConfirmed={onConfirmed} />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByText("launch"));

    const label = () => document.querySelector(".bstep")!;
    const fill = () => document.querySelector<HTMLElement>(".bprog-fill")!.style.width;

    // Step 1 — the car. The route is here to CORRECT, not to answer: the
    // hero card already took it, and it arrives filled in.
    expect(label()).toHaveTextContent("Step one of four · Your car");
    expect(fill()).toBe("25%");
    expect(screen.getByRole("combobox", { name: /from/i })).toHaveValue("Queen Beatrix International Airport");
    fireEvent.click(screen.getByRole("button", { name: /flight lands at/i }));
    fireEvent.click(screen.getByRole("option", { name: "2:00 PM" }));
    expect(await screen.findByText(/Your driver waits from 2:30 PM/)).toBeInTheDocument();

    next(/^your details$/i);
    await waitFor(() => expect(label()).toHaveTextContent("Step two of four · Your details"));
    fillContact();

    next(/^review$/i);
    await waitFor(() => expect(label()).toHaveTextContent("Step three of four · Review"));
    expect(screen.getByText(/Does this look/)).toBeInTheDocument();
    // review reads back what the driver will be told
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();

    // Step 4 — the card. Arriving is what reserves the ride and asks for
    // the payment intent; the traveller does not press anything to start it.
    next(/^continue to payment$/i);
    await waitFor(() => expect(label()).toHaveTextContent("Step four of four · Payment"));
    await waitFor(() => expect(mounted.length).toBe(1));
    expect(fetch).toHaveBeenCalledWith("/api/create-payment-intent", expect.objectContaining({ method: "POST" }));

    // and the primary is now the price, not another "next"
    const pay = await screen.findByRole("button", { name: /^pay \$\d/i });
    fireEvent.click(pay);
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ rideId: "ride-9", paid: true, time: "14:30" }),
    ));
  });

  it("leaves a retry, not a dead button, when the reservation never lands", async () => {
    rideInsert.fails = true;
    const onConfirmed = vi.fn();
    try {
      render(
        <BookingProvider>
          <Opener />
          <BookingOverlay onConfirmed={onConfirmed} />
        </BookingProvider>,
      );
      fireEvent.click(screen.getByText("launch"));
      fireEvent.click(screen.getByRole("button", { name: /flight lands at/i }));
      fireEvent.click(screen.getByRole("option", { name: /^2:00 PM$/ }));
      await screen.findByText(/Your driver waits from 2:30 PM/);
      next(/^your details$/i);
      await screen.findByLabelText(/name for the driver's sign/i);
      fillContact();
      next(/^review$/i);
      await screen.findByText(/Does this look/);
      next(/^continue to payment$/i);

      // The step is reached, the reservation is not, and the reason says so.
      await screen.findByRole("alert");
      expect(document.querySelector(".bstep")).toHaveTextContent("Payment");
      // no empty card box sitting where a field never arrived
      expect(document.querySelector(".pay-mount")).toBeNull();

      // The button in front of the error retries the whole thing rather than
      // doing nothing, and this time the reservation lands.
      rideInsert.fails = false;
      fireEvent.click(await screen.findByRole("button", { name: /^try again$/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /^pay \$\d/i })).toBeInTheDocument());
    } finally {
      rideInsert.fails = false;
    }
  });
});
