import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Steps, { STEPS_ID } from "./Steps";
import Landing from "../pages/Landing";
import { BookingProvider } from "../booking/BookingContext";
import { MIN_NOTICE_HOURS, durationLabel } from "../lib/derivedTime";
import { AIRPORT_FREE_WAIT_MINUTES, ADDRESS_FREE_WAIT_MINUTES, confirmWindowLabel } from "../lib/policy";
import { ACTIVE_LEAD_HOURS } from "../lib/tripStatus";
import { BOOKINGS_EMAIL } from "../lib/site";

// Landing's quote card and fleet read pricing from Supabase; stub it so the
// whole page can render for the link checks at the bottom.
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

const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

describe("the step strip", () => {
  it("is four steps, in order, each with a real heading", () => {
    render(<Steps />);
    const section = document.getElementById(STEPS_ID)!;
    expect(section).not.toBeNull();
    // an ordered list, so "1 of 4" is announced — not four divs
    const list = section.querySelector(":scope ol")!;
    expect(list).not.toBeNull();
    expect(list.getAttribute("role")).toBe("list");
    const steps = within(list as HTMLElement).getAllByRole("listitem")
      .filter((li) => li.parentElement === list);
    expect(steps).toHaveLength(4);
    for (const step of steps) {
      expect(within(step).getByRole("heading", { level: 3 })).toBeInTheDocument();
    }
    // the section heading sits above them, one level up
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent("What happens after you book.");
    // the drawn numerals are decoration — the list already says the position
    for (const n of section.querySelectorAll(".snum")) expect(n).toHaveAttribute("aria-hidden", "true");
  });

  it("states every number from the constant that decides it", () => {
    render(<Steps />);
    const strip = text(document.getElementById(STEPS_ID)!);
    expect(strip).toContain(BOOKINGS_EMAIL);
    expect(strip).toContain(`Booking less than ${durationLabel(MIN_NOTICE_HOURS * 60)} ahead?`);
    expect(strip).toContain(`confirms on WhatsApp within ${confirmWindowLabel()}`);
    expect(strip).toContain(`Waiting is free: ${AIRPORT_FREE_WAIT_MINUTES} minutes after you actually land, ${ADDRESS_FREE_WAIT_MINUTES} at an address`);
    expect(strip).toContain(`My trips ${durationLabel(ACTIVE_LEAD_HOURS * 60)} before pickup`);
  });

  it("never promises a photo, a morning message, a late fee or a card charge", () => {
    render(<Steps />);
    const strip = text(document.getElementById(STEPS_ID)!);
    expect(strip).not.toMatch(/photo/i);
    expect(strip).not.toMatch(/\bthe morning\b/i);
    expect(strip).not.toMatch(/\bfee\b|a fee may apply|charge half/i);
    expect(strip).not.toMatch(/\bcard\b|charged (?:to|on|today)/i);
    expect(strip).not.toMatch(/\b(he|him|his)\b/i);
  });
});

describe("getting to the step strip", () => {
  it("is reached from the nav and from the footer sitemap", () => {
    const { container } = render(
      <MemoryRouter>
        <BookingProvider>
          <Landing />
        </BookingProvider>
      </MemoryRouter>,
    );
    // the anchor is on the page the links lead to
    expect(container.querySelector(`#${STEPS_ID}`)).not.toBeNull();
    const nav = container.querySelector("nav.nav") as HTMLElement;
    const foot = screen.getByRole("contentinfo");
    expect(within(nav).getByRole("link", { name: "How it works" })).toHaveAttribute("href", `/#${STEPS_ID}`);
    expect(within(foot).getByRole("link", { name: "How it works" })).toHaveAttribute("href", `/#${STEPS_ID}`);
  });

  it("sits between the hero and the pillars", () => {
    const { container } = render(
      <MemoryRouter>
        <BookingProvider>
          <Landing />
        </BookingProvider>
      </MemoryRouter>,
    );
    const ids = [...container.querySelectorAll("#top, #how-it-works, #services")].map((el) => el.id);
    expect(ids).toEqual(["top", STEPS_ID, "services"]);
  });
});
