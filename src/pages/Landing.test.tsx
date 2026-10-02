import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";
import { BookingProvider } from "../booking/BookingContext";
import { FREE_CANCEL_HOURS, AIRPORT_FREE_WAIT_MINUTES } from "../lib/policy";
import { CHILD_SEAT_USD, MAX_CHILD_SEATS, usd } from "../lib/quote";
import { MAX_SEAT_AGE } from "../lib/childSeats";
import { MIN_NOTICE_HOURS, durationLabel } from "../lib/derivedTime";
import indexHtml from "../../index.html?raw";

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
    // The headline is two lines by design now, so it carries a <br>. What
    // must survive that is the SENTENCE: a screen reader, a copy-paste and a
    // crawler all still get one clean line with the space intact — which is
    // what this asserts, and why the old "no <br>" rule is no longer the
    // way to guarantee it.
    expect(container.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim())
      .toBe("Your ride is ready when you are.");
    // the three marks under the headline (§07)
    expect(screen.getAllByText(/Private, never shared/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Fixed price/i).length).toBeGreaterThanOrEqual(1);
    // the card is symmetric: from and to are the same control, and
    // planning-from-abroad pre-fills pickup to the airport (§3.8)
    const pickup = screen.getByRole("combobox", { name: "From" });
    // the field carries the name that fits it; the canonical one is on the
    // selection, on hover, and in the dropdown (see PlaceCombobox.test)
    expect(pickup).toHaveValue("Queen Beatrix Airport");
    expect(screen.getByRole("combobox", { name: "To" })).toBeInTheDocument();
    // Reverse is not on the hero card in the mockup; it lives on step 1 of
    // the flow, which is the only place it was ever used twice.
    expect(screen.queryByRole("button", { name: /reverse pickup and drop-off/i })).toBeNull();
    // certainty needs no exclamation mark
    expect(container.textContent).not.toContain("!");
  });
});

// The pillars and the FAQ were written before the guest emails and the
// booking rules, and promised a driver photo sent "the morning you
// travel", a driver "at the gate" with a sign, sixty minutes of waiting,
// "three hours late and your driver is still there", half the fare for a
// late cancel, free changes and free child seats "because the law
// requires them". None of it was built or decided. These pin the page to
// what the product does (api/booking-alerts.ts, src/lib/policy.ts), so
// the old promises cannot drift back in with a copy edit.
describe("Landing — only promises what is true", () => {
  function copyOf(selector: string): string {
    const { container } = render(
      <MemoryRouter>
        <BookingProvider>
          <Landing />
        </BookingProvider>
      </MemoryRouter>,
    );
    const el = container.querySelector(selector);
    expect(el, selector).not.toBeNull();
    return el!.textContent!.replace(/\s+/g, " ");
  }

  // Each of these was on the page, and each is untrue or was never the
  // owner's word. The sign, the waiting times and the seat price came off
  // this list when the owner decided them; they are pinned below instead.
  const NEVER: [string, RegExp][] = [
    ["a driver photo", /photo/i],
    ["a message the morning you travel", /\bthe morning\b/i],
    ["being met at the gate", /\bat the gate\b/i],
    ["a late-cancel fee", /a fee may apply/i],
    ["a late-cancel fee of half", /charge half|\bhalf\b/i],
    ["a waiting time nobody set", /three hours|sixty minutes/i],
    ["free child seats", /no extra charge/i],
    ["a legal claim", /\blaw\b/i],
    ["free changes", /changes[^.]*\bfree\b/i],
    ["the fare settled in advance", /settled in advance/i],
  ];

  it.each([["the step strip", "#how-it-works"], ["the pillars", "#services"], ["the FAQ", "#faq"]])(
    "nothing in %s promises what the product does not do",
    (_, selector) => {
      const text = copyOf(selector);
      for (const [what, pattern] of NEVER) expect(text, what).not.toMatch(pattern);
      // A driver is "your driver", or "they" — never "he".
      expect(text).not.toMatch(/\b(he|him|his)\b/i);
    },
  );

  // The strip is the page's account of what happens after booking, so it
  // carries the promises most likely to drift: what you pay with, and the
  // sign. Card payment is off; nothing is taken online.
  it("walks through the steps without promising a card charge or a late fee", () => {
    const steps = copyOf("#how-it-works");
    expect(steps).not.toMatch(/\bcard\b/i);
    expect(steps).not.toMatch(/\bfee\b|late charge/i);
    expect(steps).toMatch(/pay nothing now/i);
    expect(steps).toMatch(/in cash at the end, in US dollars or florins/);
    // the sign is an airport thing — a hotel pickup gets no sign
    expect(steps).toMatch(/At the airport they wait in arrivals with your name on a sign/);
    expect(steps).toMatch(/name, car and plate/);
  });

  // Seven short answers (the owner: "keep it minimal"), each from the
  // constant that decides it.
  it("states the owner's decisions, from the constants that hold them", () => {
    const faq = copyOf("#faq");
    expect(document.querySelectorAll("#faq .fitem").length).toBeLessThanOrEqual(7);
    expect(faq).toMatch(/arrivals hall with a sign with your name/);
    expect(faq).toMatch(/name, car and plate/);
    expect(faq).toContain(`${usd(CHILD_SEAT_USD)} per seat each way`);
    expect(faq).toContain(`children up to ${MAX_SEAT_AGE}`);
    expect(MAX_CHILD_SEATS).toBe(2);
    expect(faq).toMatch(/In cash to your driver, in US dollars or florins/);
    expect(faq).toMatch(/Tips are up to you/);
    expect(faq).toMatch(/actually land/);
    expect(faq).toContain(`waits up to ${AIRPORT_FREE_WAIT_MINUTES} minutes, free`);
    expect(faq).toMatch(/Can I cancel\?\W*Yes, for free/);
    expect(faq).toContain(`at least ${FREE_CANCEL_HOURS} hours ahead`);
    expect(faq).toContain(`At least ${durationLabel(MIN_NOTICE_HOURS * 60)} before pickup`);
    expect(faq).toMatch(/Do I need an account\?\W*No\./);

    const pillars = copyOf("#services");
    expect(pillars).toContain(`${AIRPORT_FREE_WAIT_MINUTES} minutes`);
    expect(pillars).toMatch(/name, car and plate/);
  });

  it("keeps the link previews to the same facts", () => {
    const metas = [...indexHtml.matchAll(/<meta[^>]+(?:name|property)="(?:description|og:description|twitter:description)"[^>]*>/g)]
      .map((m) => m[0]);
    expect(metas).toHaveLength(3);
    for (const m of metas) {
      expect(m).not.toMatch(/\bgate\b|settled|in advance|photo/i);
      expect(m).toMatch(/arrivals hall/);
    }
  });
});
