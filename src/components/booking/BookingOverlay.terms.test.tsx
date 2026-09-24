// Accepting the booking terms at checkout.
//
// Walks the real flow to the last step in the mode the site runs in today
// (no card key: reserve, settle with the driver), with the legal documents'
// approval state controlled here — because whether checkout asks for
// acceptance at all depends on whether there is anything real to accept.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../booking/useAuth", () => ({
  useAuth: () => ({ account: null, user: null, loading: false }),
}));

vi.mock("../../lib/supabase", () => {
  const make = () => {
    const b: {
      insert: (p: Record<string, unknown>) => unknown;
      select: () => unknown; eq: () => unknown; order: () => unknown;
      then: (res: (v: unknown) => unknown) => Promise<unknown>;
    } = {
      insert: (p: Record<string, unknown>) => ({
        select: () => ({ single: () => Promise.resolve({ data: { id: "ride-9", booking_ref: p.booking_ref ?? "CB-TEST9" }, error: null }) }),
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

// Which documents are approved, per test.
const legal = vi.hoisted(() => ({ terms: false, cancellation: false, privacy: false }));
vi.mock("../../lib/legal", () => {
  const d = (slug: "terms" | "privacy" | "cancellation", title: string) => ({
    get published() { return legal[slug]; }, slug, title, path: `/${slug}`,
  });
  return {
    LEGAL: {
      terms: d("terms", "Terms of Service"),
      privacy: d("privacy", "Privacy Policy"),
      cancellation: d("cancellation", "Cancellation Policy"),
    },
    bookingTermsReady: () => legal.terms && legal.cancellation,
  };
});

import { BookingProvider, useBooking } from "../../booking/BookingContext";
import BookingOverlay from "./BookingOverlay";
import { placeById, selFromPlace, AIRPORT } from "../../data/places";

function Opener() {
  const { open, setField } = useBooking();
  return (
    <button onClick={() => {
      setField("flightLanding", "14:05");
      open({ from: selFromPlace(AIRPORT), to: selFromPlace(placeById("ritz")!), date: "2026-09-01", pax: 2 });
    }}>launch</button>
  );
}

const next = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));

/** The real flow, to the step where the customer commits. */
async function toLastStep(onConfirmed = vi.fn()) {
  render(<BookingProvider><Opener /><BookingOverlay onConfirmed={onConfirmed} /></BookingProvider>);
  fireEvent.click(screen.getByText("launch"));
  next(/^your details$/i);
  await screen.findByText(/Your driver waits from/);
  fireEvent.change(screen.getByLabelText(/name for the driver's sign/i), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText(/whatsapp \/ phone/i), { target: { value: "+1 555 123 4567" } });
  next(/^review$/i);
  next(/continue to payment/i);
  await screen.findByText(/card payment isn't switched on/i);
  return onConfirmed;
}

beforeEach(() => { legal.terms = false; legal.cancellation = false; legal.privacy = false; });

describe("before the policies are approved", () => {
  // There is nothing real to accept, so checkout asks nothing — rather than
  // a box naming documents that say "being finalised".
  it("asks the customer to accept nothing, and books as it does today", async () => {
    const onConfirmed = await toLastStep();
    expect(screen.queryByRole("checkbox", { name: /accept/i })).toBeNull();
    next(/reserve your car/i);
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
  });

  it("still asks nothing when only one of the two is approved", async () => {
    legal.terms = true;
    await toLastStep();
    expect(screen.queryByRole("checkbox", { name: /accept/i })).toBeNull();
  });
});

describe("once the terms and cancellation policy are approved", () => {
  beforeEach(() => { legal.terms = true; legal.cancellation = true; });

  // Read out whole: the agreement a screen-reader user hears is the same
  // sentence a sighted customer reads, with nothing spliced into it.
  it("names exactly which documents are being accepted, unchecked", async () => {
    await toLastStep();
    const box = screen.getByRole("checkbox", { name: /i accept cabby.s terms of service and cancellation policy/i });
    expect(box).not.toBeChecked();
  });

  // Following a link in this tab would throw away the booking, which lives
  // in memory. Each policy opens in a new one, and says so.
  it("opens each policy in a new tab, so the booking in progress survives", async () => {
    await toLastStep();
    for (const [name, href] of [[/terms of service/i, "/terms"], [/cancellation policy/i, "/cancellation"]] as const) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toMatch(/noopener/);
      expect(link).toHaveAccessibleDescription(/opens in a new tab/i);
    }
  });

  it("will not book until the customer accepts, and says why with focus on the box", async () => {
    const onConfirmed = await toLastStep();
    next(/reserve your car/i);
    const box = screen.getByRole("checkbox", { name: /i accept/i });
    expect(await screen.findByRole("alert")).toHaveTextContent(/please accept the terms of service and cancellation policy/i);
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveFocus();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  // The confirm handler is registered in an effect; if it did not
  // re-register on acceptance it would keep refusing forever.
  it("books once the box is checked", async () => {
    const onConfirmed = await toLastStep();
    next(/reserve your car/i);
    fireEvent.click(screen.getByRole("checkbox", { name: /i accept/i }));
    expect(screen.queryByText(/please accept the terms/i)).toBeNull();
    next(/reserve your car/i);
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
  });

  it("mentions the privacy policy only once it is published", async () => {
    await toLastStep();
    expect(screen.queryByRole("link", { name: /privacy policy/i })).toBeNull();
  });

  it("links the privacy policy as read, not accepted, when it is published", async () => {
    legal.privacy = true;
    await toLastStep();
    expect(screen.getByRole("checkbox", { name: /i have read the privacy policy/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy");
  });
});
