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
    // headline reads as a clean sentence for SR / copy-paste / SEO
    expect(container.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim())
      .toBe("Getting there was always the point.");
    expect(container.querySelector("h1 br")).toBeNull();
    // trust strip + hero badge both carry the promise
    expect(screen.getAllByText(/Settled in advance/i).length).toBeGreaterThanOrEqual(1);
    // the fare card is symmetric: pickup and drop-off are the same control
    expect(screen.getByLabelText(/pick up/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/drop off/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /swap pickup and drop-off/i })).toBeInTheDocument();
    // certainty needs no exclamation mark
    expect(container.textContent).not.toContain("!");
  });
});
