import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Journey, { JOURNEY_ID, readAt } from "./Journey";
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

describe("readAt — where the car is, from where things are on screen", () => {
  // a road from 100px to 900px down the screen, rings at 150/350/550/750
  const road = { top: 100, height: 800 };
  const rings = [150, 350, 550, 750];

  it("waits at the start until the route comes up to the reading line", () => {
    expect(readAt(road, rings, 40)).toEqual({ car: 0, active: -1, arrived: false });
  });

  it("is level with the reading line in between, lighting the last ring it has passed", () => {
    expect(readAt(road, rings, 400)).toEqual({ car: 300, active: 1, arrived: false });
    expect(readAt(road, rings, 750)).toEqual({ car: 650, active: 3, arrived: false });
  });

  // A ring brought to the line by its own button lands on it to within
  // subpixel rounding; it must count as reached, not stay one short.
  it("counts a ring sitting on the line as reached", () => {
    expect(readAt(road, rings, 349.7).active).toBe(1);
  });

  it("parks at the arrival dot once the road has passed the line", () => {
    expect(readAt(road, rings, 2000)).toEqual({ car: 800, active: 3, arrived: true });
  });

  it("never reads a road with no length as arrived", () => {
    expect(readAt({ top: 0, height: 0 }, [], 400).arrived).toBe(false);
  });
});

describe("the route", () => {
  it("is an ordered list of four stops, none current before the route is reached", () => {
    mount();
    const list = screen.getByRole("list", { name: /step by step/i });
    expect(list.tagName).toBe("OL");
    const stops = screen.getAllByRole("button").filter((b) => b.classList.contains("jstop"));
    expect(stops.map((s) => s.getAttribute("aria-label"))).toEqual(["Book", "Get confirmed", "Meet your driver", "Ride and pay"]);
    expect(stops.filter((s) => s.hasAttribute("aria-current"))).toEqual([]);
  });

  // The owner's complaint: the words changed or vanished under a reader
  // who had scrolled a few pixels, because four stops shared one cell and
  // the scroll chose which showed. Every stop's words are on the page now,
  // and nothing about them depends on where the car is.
  it("shows every stop's words at once, with nothing hidden or faded", () => {
    mount();
    const titles = screen.getAllByRole("heading", { level: 3 });
    expect(titles.map((h) => h.textContent)).toEqual(["Book", "Get confirmed", "Meet your driver", "Ride and pay"]);
    for (const h of titles) {
      const step = h.closest("li")!;
      expect(step.closest("[aria-hidden='true'],[hidden]")).toBeNull();
      for (const el of step.querySelectorAll(".jtext, .jwhy")) expect(el.className).toMatch(/^(jtext|jwhy)$/);
    }
  });

  it("lights the ring the reading line has reached, and leaves the words alone", () => {
    // jsdom has no layout: place the road and the rings by hand. The
    // screen is 768px, so the reading line is at 384.
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const box = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} });
      if (this.classList.contains("jroad")) return box(100, 800) as DOMRect;
      const i = ["Book", "Get confirmed", "Meet your driver", "Ride and pay"].indexOf(this.getAttribute("aria-label") ?? "");
      if (i >= 0) return box(150 + i * 200 - 29, 58) as DOMRect;
      return box(0, 0) as DOMRect;
    });
    try {
      mount();
      const before = text();
      expect(screen.getByRole("button", { name: "Get confirmed" })).toHaveAttribute("aria-current", "step");
      expect(screen.getByRole("button", { name: "Book" })).toHaveClass("past");
      expect(screen.getByRole("button", { name: "Meet your driver" })).not.toHaveClass("on");
      expect((document.querySelector(".jroad") as HTMLElement).style.getPropertyValue("--car")).toBe("284.0px");
      expect(text()).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  // It used to sit in the last of four faded panels and was taken out of
  // the tab order until that panel showed.
  it("keeps the booking button in the tab order all the time", () => {
    mount();
    expect(screen.getByRole("button", { name: /book your ride/i })).not.toHaveAttribute("tabindex");
  });

  it("brings a stop up to the reading line when it is clicked", () => {
    mount();
    const calls: ScrollToOptions[] = [];
    const orig = window.scrollTo;
    window.scrollTo = ((o: ScrollToOptions) => { calls.push(o); }) as typeof window.scrollTo;
    fireEvent.click(screen.getByRole("button", { name: "Meet your driver" }));
    window.scrollTo = orig;
    expect(calls).toHaveLength(1);
    expect(calls[0].behavior).toBe("smooth");
  });

  it("jumps rather than glides for a reader who asked for less motion", () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      mount();
      const calls: ScrollToOptions[] = [];
      const orig = window.scrollTo;
      window.scrollTo = ((o: ScrollToOptions) => { calls.push(o); }) as typeof window.scrollTo;
      fireEvent.click(screen.getByRole("button", { name: "Book" }));
      window.scrollTo = orig;
      expect(calls[0].behavior).toBe("auto");
    } finally {
      window.matchMedia = mm;
    }
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
