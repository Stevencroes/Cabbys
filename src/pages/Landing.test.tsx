import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";
import { BookingProvider } from "../booking/BookingContext";
import { FREE_CANCEL_HOURS } from "../lib/policy";
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

  // Each of these was on the page, and each is either untrue or a policy
  // the owner has not set.
  const NEVER: [string, RegExp][] = [
    ["a driver photo", /photo/i],
    ["a message the morning you travel", /\bthe morning\b/i],
    ["being met at the gate", /\bat the gate\b/i],
    ["a name sign", /\bsign\b/i],
    ["a late-cancel fee of half", /\bhalf\b/i],
    ["a waiting time", /three hours|sixty minutes|60 minutes/i],
    ["free child seats", /no extra charge/i],
    ["a legal claim", /\blaw\b/i],
    ["free changes", /changes[^.]*\bfree\b/i],
    ["the fare settled in advance", /settled in advance/i],
  ];

  it.each([["the pillars", "#services"], ["the FAQ", "#about"]])(
    "nothing in %s promises what the product does not do",
    (_, selector) => {
      const text = copyOf(selector);
      for (const [what, pattern] of NEVER) expect(text, what).not.toMatch(pattern);
      // A driver is "your driver", or "they" — never "he".
      expect(text).not.toMatch(/\b(he|him|his)\b/i);
    },
  );

  it("says what the driver email and My trips actually carry", () => {
    const faq = copyOf("#about");
    expect(faq).toMatch(/name, car and plate/);
    expect(faq).toMatch(/phone number appears in My trips two hours before pickup/);
    expect(faq).toMatch(/inside the arrivals hall/);
    // the cancel rule, from the one constant, and the fee left undecided
    expect(faq).toContain(`free up to ${FREE_CANCEL_HOURS} hours before pickup`);
    expect(faq).toMatch(/a fee may apply/);
    // no online change exists; a person does it
    expect(faq).toMatch(/Changes aren't made online/);
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
