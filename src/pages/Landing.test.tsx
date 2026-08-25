import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";
import { BookingProvider } from "../booking/BookingContext";

// The quote card + fleet read pricing from Supabase; stub it for the render.
vi.mock("../lib/supabase", () => {
  const builder = () => {
    const b: {
      select: () => unknown; eq: () => unknown; order: () => unknown;
      then: (res: (v: unknown) => unknown) => Promise<unknown>;
    } = {
      select() { return b; }, eq() { return b; }, order() { return b; },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
    };
    return b;
  };
  return {
    supabase: {
      from: builder,
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

describe("Landing", () => {
  it("renders the v3 hero and trust copy with no exclamation points", () => {
    const { container } = render(
      <MemoryRouter>
        <BookingProvider>
          <Landing />
        </BookingProvider>
      </MemoryRouter>,
    );
    // The headline is two lines by design now, so it carries a <br>. What
    // must survive that is the SENTENCE: a screen reader, a copy-paste and a
    // crawler all still get one clean line with the space intact — which is
    // what this asserts, and why the old "no <br>" rule is no longer the
    // way to guarantee it.
    expect(container.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim())
      .toBe("Elevated transfers. Every time.");
    // the three marks under the headline (§07)
    expect(screen.getAllByText(/Professional Drivers/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/No Hidden Fees/i).length).toBeGreaterThanOrEqual(1);
    // the card is symmetric: from and to are the same control, and
    // planning-from-abroad pre-fills pickup to the airport (§3.8)
    const pickup = screen.getByRole("combobox", { name: "From" });
    expect(pickup).toHaveValue("Queen Beatrix International Airport");
    expect(screen.getByRole("combobox", { name: "To" })).toBeInTheDocument();
    // Reverse is not on the hero card in the mockup; it lives on step 1 of
    // the flow, which is the only place it was ever used twice.
    expect(screen.queryByRole("button", { name: /reverse pickup and drop-off/i })).toBeNull();
    // certainty needs no exclamation mark
    expect(container.textContent).not.toContain("!");
  });
});
