// The fleet cards show what a car holds as two icons and two numbers. The
// icons are the unit for the eye only — each card is a button, and its name
// is all a screen reader hears, so the words have to be in it.
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Fleet from "./Fleet";
import { BookingProvider } from "../booking/BookingContext";
import { VEHICLES } from "../data/vehicles";

// The "from" fares are computed from the Supabase pricing; the cards must
// render without it, as they do while it loads.
vi.mock("../lib/pricing", async (orig) => ({
  ...(await orig<typeof import("../lib/pricing")>()),
  loadPricing: () => new Promise(() => {}),
}));

describe("Fleet cards", () => {
  it("name each car with its guests and bags in words, not only icons", () => {
    render(
      <MemoryRouter>
        <BookingProvider><Fleet /></BookingProvider>
      </MemoryRouter>,
    );
    for (const v of VEHICLES) {
      const card = screen.getByRole("button", { name: new RegExp(`^${v.name}\\b`) });
      expect(card).toHaveAccessibleName(expect.stringContaining(`${v.pax} guests`));
      expect(card).toHaveAccessibleName(expect.stringContaining(`${v.bags} bags`));
      // the photo is decoration inside a button that already says the name
      expect(card.querySelector("img")).toHaveAttribute("alt", "");
    }
  });
});
