import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Landing from "./Landing";
import { BookingProvider } from "../booking/BookingContext";

// The hero booking card reads pricing + auth from Supabase; stub it for the render.
vi.mock("../lib/supabase", () => {
  const builder = () => {
    const b: any = {
      select() { return b; }, eq() { return b; }, order() { return b; },
      then(res: any) { return Promise.resolve({ data: [], error: null }).then(res); },
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
  it("renders hero tagline and ethos copy with no exclamation points", () => {
    const { container } = render(
      <BookingProvider>
        <Landing />
      </BookingProvider>,
    );
    expect(screen.getByText(/silence\./i)).toBeInTheDocument();
    // headline must read correctly for SR / copy-paste / SEO — real space, no <br>
    expect(container.querySelector("h1")?.textContent).toBe("Arrive in silence.");
    expect(container.querySelector("h1 br")).toBeNull();
    expect(screen.getByText(/Settled in advance/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain("!");
  });
});
