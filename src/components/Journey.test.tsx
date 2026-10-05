import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Journey, { JOURNEY_ID, progressAt, routeAt } from "./Journey";
import Landing from "../pages/Landing";
import { BookingProvider } from "../booking/BookingContext";
import { AIRPORT_FREE_WAIT_MINUTES, FREE_CANCEL_HOURS } from "../lib/policy";

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

const mount = () => render(<MemoryRouter><Journey /></MemoryRouter>);
const text = () => (document.getElementById(JOURNEY_ID)!.textContent ?? "").replace(/\s+/g, " ");

describe("routeAt — scroll to car", () => {
  it("starts at the start, on the first stop, and ends at the arrival dot", () => {
    expect(routeAt(0)).toEqual({ car: 0, active: 0, arrived: false });
    const end = routeAt(1);
    expect(end.car).toBeCloseTo(1);
    expect(end.active).toBe(3);
    expect(end.arrived).toBe(true);
  });

  it("only ever moves the car forward as the page scrolls down", () => {
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const { car } = routeAt(p);
      expect(car).toBeGreaterThanOrEqual(last - 1e-9);
      last = car;
    }
  });

  it("visits every stop in order, and parks at each long enough to read", () => {
    const seen: number[] = [];
    for (let p = 0; p <= 1; p += 0.005) {
      const { active } = routeAt(p);
      if (seen[seen.length - 1] !== active) seen.push(active);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
    // half of each stop's stretch the car is standing still
    expect(routeAt(0.2).car).toBeCloseTo(routeAt(0.12).car);
  });

  it("clamps scroll outside the section", () => {
    expect(routeAt(-0.4)).toEqual(routeAt(0));
    expect(routeAt(1.7)).toEqual(routeAt(1));
  });
});

describe("progressAt — line on screen to progress", () => {
  const at = (centre: number, vh = 1000) => progressAt({ top: centre - 29, height: 58 }, vh);
  it("is 0 until the line is up off the bottom of the screen, 1 once it is near the top", () => {
    expect(at(1200)).toBe(0);
    expect(at(800)).toBe(0);
    expect(at(220)).toBeCloseTo(1);
    expect(at(-300)).toBe(1);
  });
  it("runs evenly in between, so every stop gets the same stretch of scroll", () => {
    expect(at(510)).toBeCloseTo(0.5);
    expect(at(655)).toBeCloseTo(0.25);
  });
  it("does not divide by a zero-height screen", () => {
    expect(progressAt({ top: 0, height: 0 }, 0)).toBe(0);
  });
});

describe("the route", () => {
  it("is an ordered list of four stops, the first one current", () => {
    mount();
    const list = screen.getByRole("list", { name: /step by step/i });
    expect(list.tagName).toBe("OL");
    const stops = screen.getAllByRole("button").filter((b) => b.classList.contains("jstop"));
    expect(stops.map((s) => s.textContent)).toEqual(["Book", "Get confirmed", "Meet your driver", "Ride and pay"]);
    expect(stops.filter((s) => s.getAttribute("aria-current") === "step")).toEqual([stops[0]]);
  });

  it("keeps every stop's words in the DOM, in order, one heading each", () => {
    mount();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Book", "Get confirmed", "Meet your driver", "Ride and pay"]);
    expect(document.querySelectorAll(".jpanel.on")).toHaveLength(1);
  });

  // The CTA sits in the last panel, which is faded rather than removed, so
  // it must be out of the tab order until that panel is the one showing.
  it("keeps the booking button out of the tab order until the last stop", () => {
    mount();
    expect(screen.getByRole("button", { name: /book your ride/i })).toHaveAttribute("tabindex", "-1");
  });

  it("scrolls to a stop when it is clicked, rather than skipping the road", () => {
    mount();
    const calls: ScrollToOptions[] = [];
    const orig = window.scrollTo;
    window.scrollTo = ((o: ScrollToOptions) => { calls.push(o); }) as typeof window.scrollTo;
    fireEvent.click(screen.getByRole("button", { name: "Meet your driver" }));
    window.scrollTo = orig;
    expect(calls).toHaveLength(1);
  });

  // The promises the step strip and the pillars were pinned to are pinned
  // here too, read from the same constants.
  it("carries every step and every reason, from the constants that decide them", () => {
    mount();
    const t = text();
    expect(t).toMatch(/pay nothing now/i);
    expect(t).toMatch(/in cash at the end, in US dollars or florins/);
    expect(t).toMatch(/At the airport they wait in arrivals with your name on a sign/);
    expect(t).toMatch(/name, car and plate/);
    expect(t).toContain(`wait up to ${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, free`);
    expect(t).toContain(`up to ${FREE_CANCEL_HOURS} hours before pickup`);
    expect(t).toMatch(/Just your group/);
    expect(t).not.toMatch(/\bcard\b|\bfee\b|photo|\bat the gate\b|\b(he|him|his)\b/i);
  });
});

describe("getting to the route", () => {
  const page = () => render(
    <MemoryRouter>
      <BookingProvider>
        <Landing />
      </BookingProvider>
    </MemoryRouter>,
  );

  it("is reached from the nav and from the footer sitemap", () => {
    const { container } = page();
    expect(container.querySelector(`#${JOURNEY_ID}`)).not.toBeNull();
    const nav = container.querySelector("nav.nav") as HTMLElement;
    const foot = screen.getByRole("contentinfo");
    expect(within(nav).getByRole("link", { name: "How it works" })).toHaveAttribute("href", `/#${JOURNEY_ID}`);
    expect(within(foot).getByRole("link", { name: "How it works" })).toHaveAttribute("href", `/#${JOURNEY_ID}`);
    // the pillars merged into the route; the nav no longer has a second
    // link to the same place, and nothing on the page answers #services
    expect(within(nav).queryByRole("link", { name: /why cabby/i })).toBeNull();
    expect(container.querySelector("#services")).toBeNull();
  });

  it("sits straight under the hero, ahead of the fleet", () => {
    const { container } = page();
    const ids = [...container.querySelectorAll("#top, #how-it-works, #fleet")].map((el) => el.id);
    expect(ids).toEqual(["top", JOURNEY_ID, "fleet"]);
  });
});
