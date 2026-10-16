import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Journey, { JOURNEY_ID, REASONS, STOPS } from "./Journey";
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

const startBooking = vi.fn();
// partial: Landing (below) reads the module's other exports
vi.mock("../booking/useStartBooking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../booking/useStartBooking")>()),
  useStartBooking: () => startBooking,
}));

describe("the route", () => {
  it("is an ordered list of four stops, numbered in order", () => {
    mount();
    const list = screen.getByRole("list", { name: /how it works, step by step/i });
    const stops = within(list).getAllByRole("listitem");
    expect(stops).toHaveLength(4);
    // the map draws stop 4 left of stop 3; the DOM, and the number on each
    // ring, keep the order a reader follows
    expect(stops.map((li) => li.querySelector(".jnum")?.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(stops.map((li) => within(li).getByRole("heading").textContent))
      .toEqual(["Book online", "Get confirmed", "Meet your driver", "Ride and pay"]);
  });

  // The owner: remove the motion, keep everything visible. These are the
  // ways the earlier versions moved or hid words, each pinned shut.
  it("has nothing that moves with the scroll and nothing that hides a word", () => {
    const listen = vi.spyOn(window, "addEventListener");
    const { container } = mount();
    expect(listen.mock.calls.map(([type]) => type)).not.toContain("scroll");
    listen.mockRestore();
    expect(container.querySelector(".jcar, .jtrail, .jroad")).toBeNull();
    expect(container.querySelector("[aria-current], .on, .past")).toBeNull();
    for (const s of STOPS) expect(screen.getByText(s.line)).toBeVisible();
    for (const r of REASONS) expect(screen.getByText(r.body)).toBeVisible();
  });

  // A ring that took a tap would be a control with nothing left to do.
  it("draws the stops as marks, not buttons, so the only control is Book your ride", () => {
    mount();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /book your ride/i }));
    expect(startBooking).toHaveBeenCalledOnce();
  });

  it("keeps it short: one line a stop, three reasons", () => {
    mount();
    expect(REASONS).toHaveLength(3);
    for (const s of STOPS) expect(s.line.length).toBeLessThanOrEqual(60);
  });

  it("carries the reasons from the constants that decide them", () => {
    mount();
    const t = text();
    expect(t).toContain(`${FREE_CANCEL_HOURS} hours before pickup`);
    expect(t).toContain(`${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, free`);
    expect(t).toMatch(/Fixed when you book/);
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
