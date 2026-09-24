import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Footer from "./Footer";
import { BookingProvider } from "../booking/BookingContext";

function renderFooter() {
  return render(<MemoryRouter><BookingProvider><Footer /></BookingProvider></MemoryRouter>);
}

// Where each in-page target actually is. A footer link may point at one of
// these only if the section is ABOUT what the link names.
const RELATED: Record<string, RegExp> = {
  "/#fleet": /fleet/i,
  "/#about": /^faq$/i,        // #about is the FAQ section
};

describe("the footer's links", () => {
  it("never points at a section unrelated to what it names", () => {
    renderFooter();
    for (const a of within(screen.getByRole("contentinfo")).getAllByRole("link")) {
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("/#")) {
        const rule = RELATED[href];
        expect(rule, `${a.textContent} → ${href} is not a known section`).toBeDefined();
        expect(a.textContent, `${a.textContent} → ${href}`).toMatch(rule);
      }
    }
  });

  it("sends each policy to its own page, from the small print", () => {
    renderFooter();
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Cancellation" })).toHaveAttribute("href", "/cancellation");
  });

  it("no longer credits the typefaces", () => {
    renderFooter();
    expect(screen.queryByText(/cormorant/i)).toBeNull();
  });

  it("no longer advertises hourly hire, which Cabby's does not sell", () => {
    renderFooter();
    expect(screen.queryByText(/hourly/i)).toBeNull();
  });

  // They used to be links to the "Why Cabby's" band, which describes none
  // of them. Now each one starts a booking.
  it("makes each transfer type start a booking rather than scroll somewhere generic", () => {
    renderFooter();
    for (const name of ["Airport pickup", "Resort to resort", "Cruise terminal"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
  });

  it("shows the address as a place, not a link to the top of the page", () => {
    renderFooter();
    expect(screen.getByText("Oranjestad, Aruba").closest("a")).toBeNull();
  });
});
