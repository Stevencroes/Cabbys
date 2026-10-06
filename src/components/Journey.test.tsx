import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Journey, { JOURNEY_ID, drive, nodeAt, parked, progressAt, type Drive } from "./Journey";
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

describe("nodeAt — scroll to where the car should head", () => {
  it("starts at the start and ends at the arrival dot", () => {
    expect(nodeAt(0)).toBe(0);
    expect(nodeAt(1)).toBe(5);
  });

  it("gives every stop the same stretch of scroll, in order", () => {
    const seen: number[] = [];
    const share = new Map<number, number>();
    for (let p = 0; p <= 1; p += 0.001) {
      const n = nodeAt(p);
      if (seen[seen.length - 1] !== n) seen.push(n);
      share.set(n, (share.get(n) ?? 0) + 1);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5]);
    const stops = [1, 2, 3, 4].map((n) => share.get(n)!);
    expect(Math.max(...stops) - Math.min(...stops)).toBeLessThanOrEqual(2);
  });
});

/** Runs the car frame by frame, 16ms apart, until it has nothing left to
    do; returns every place it pulled up at, and when. */
function run(start: Drive, want: number, from = 0, limit = 20000) {
  let s = start;
  const stops: { node: number; at: number }[] = [];
  for (let now = from; now < from + limit; now += 16) {
    const r = drive(s, want, now);
    s = r.s;
    if (r.reached !== null) stops.push({ node: r.reached, at: now });
    if (r.idle) return { s, stops, end: now };
  }
  throw new Error("the car never settled");
}

describe("drive — the car's own pace", () => {
  it("stops at every stop on the way, however far the scroll jumped", () => {
    const { stops } = run(parked(0), 5);
    expect(stops.map((x) => x.node)).toEqual([1, 2, 3, 4, 5]);
  });

  // The point of the change: a flick of the thumb used to put four
  // sentences on screen for a frame or two each.
  it("holds each stop for over a second before moving on", () => {
    const { stops } = run(parked(0), 5);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].at - stops[i - 1].at).toBeGreaterThanOrEqual(1100);
    }
  });

  it("drives back the same way when the reader scrolls up", () => {
    const { stops } = run(parked(4), 1);
    expect(stops.map((x) => x.node)).toEqual([3, 2, 1]);
  });

  it("sits still when it is already where the scroll is", () => {
    const r = drive(parked(2), 2, 0);
    expect(r.idle).toBe(true);
    expect(r.car).toBeCloseTo(2 / 5);
  });

  it("goes straight to a clicked stop, without the pauses on the way", () => {
    // the scroll is on its way there too, so it asks for the same stop
    const { stops } = run({ ...parked(0), rush: 4 }, 4);
    expect(stops.map((x) => x.node)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].at - stops[i - 1].at).toBeLessThan(700);
    }
  });

  it("only ever moves the car forward on the way down", () => {
    let s = parked(0);
    let last = -1;
    for (let now = 0; now < 12000; now += 16) {
      const r = drive(s, 5, now);
      s = r.s;
      expect(r.car).toBeGreaterThanOrEqual(last - 1e-9);
      last = r.car;
    }
    expect(last).toBeCloseTo(1);
  });
});

describe("progressAt — line on screen to progress", () => {
  const at = (centre: number, vh = 1000) => progressAt({ top: centre - 29, height: 58 }, vh);
  it("is 0 until the line is up off the bottom of the screen, 1 once it is near the top", () => {
    expect(at(1200)).toBe(0);
    expect(at(850)).toBe(0);
    expect(at(200)).toBeCloseTo(1);
    expect(at(-300)).toBe(1);
  });
  it("runs evenly in between, so every stop gets the same stretch of scroll", () => {
    expect(at(525)).toBeCloseTo(0.5);
    expect(at(687.5)).toBeCloseTo(0.25);
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
