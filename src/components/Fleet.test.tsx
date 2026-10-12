// The fleet cards say what a car holds in words — "6 guests · 4 bags" —
// where they used to show two icons and two bare numbers with the units
// hidden in sr-only text. Each card is a button and its name is all a
// screen reader hears, so the words have to be in it exactly once, and
// now they are also where a sighted guest can read them.
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

// No car in the fleet takes ONE of anything today; this one does, so the
// singular is exercised against the real component rather than assumed.
vi.mock("../data/vehicles", async (orig) => {
  const real = await orig<typeof import("../data/vehicles")>();
  return {
    ...real,
    VEHICLES: [...real.VEHICLES, { ...real.VEHICLES[0], id: "solo", name: "Solo Coupe", pax: 1, bags: 1 }],
  };
});

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

function mount() {
  return render(
    <MemoryRouter>
      <BookingProvider><Fleet /></BookingProvider>
    </MemoryRouter>,
  );
}

describe("Fleet cards", () => {
  it("name each car with its guests and bags in words", () => {
    mount();
    for (const v of VEHICLES) {
      const card = screen.getByRole("button", { name: new RegExp(`^${v.name}\\b`) });
      expect(card).toHaveAccessibleName(expect.stringContaining(plural(v.pax, "guest")));
      expect(card).toHaveAccessibleName(expect.stringContaining(plural(v.bags, "bag")));
      // the separator is decoration: the name must not read it out
      expect(card).not.toHaveAccessibleName(expect.stringContaining("·"));
      // the photo is decoration inside a button that already says the name
      expect(card.querySelector("img")).toHaveAttribute("alt", "");
    }
  });

  it("shows the words, rather than hiding them behind icons", () => {
    const { container } = mount();
    const spec = container.querySelector(".fcard .fspec")!;
    expect(spec.querySelector("svg")).toBeNull();
    // the unit used to be sr-only; visible now, so a hidden copy would be read twice
    expect(spec.querySelector(".sr-only")).toBeNull();
    expect(spec.textContent).toBe(`${plural(VEHICLES[0].pax, "guest")}·${plural(VEHICLES[0].bags, "bag")}`);
  });

  it("says 1 guest and 1 bag, not 1 guests", () => {
    mount();
    const solo = screen.getByRole("button", { name: /^Solo Coupe\b/ });
    expect(solo).toHaveAccessibleName(expect.stringContaining("1 guest"));
    expect(solo).not.toHaveAccessibleName(expect.stringContaining("1 guests"));
    expect(solo).not.toHaveAccessibleName(expect.stringContaining("1 bags"));
  });
});
