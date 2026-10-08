// The card is now the only place the trip is described, so what it asks has
// to be complete — and it has to ask the RIGHT hour. An airport pickup is
// timed off the landing and a departure off the take-off; a "pickup time"
// on either would be a number the dispatcher throws away, collected from
// someone who then gets asked for their flight anyway.
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { BookingProvider, useBooking } from "../../booking/BookingContext";
import QuoteCard from "./QuoteCard";

vi.mock("../../lib/geo", () => ({
  isOnIsland: () => true,
  locate: async () => ({ ok: false, message: "" }),
}));

/** Reads the flow's state back out, so a test can see whether the card
    opened it and which field the hour landed in. */
function Probe() {
  const { state } = useBooking();
  return (
    <>
      <output data-testid="open">{String(state.open)}</output>
      <output data-testid="landing">{state.flightLanding}</output>
      <output data-testid="pickup">{state.pickupTime}</output>
      <output data-testid="dep">{state.depTime}</output>
    </>
  );
}

function mount() {
  render(
    <MemoryRouter>
      <BookingProvider><QuoteCard /><Probe /></BookingProvider>
    </MemoryRouter>,
  );
}

/** Type into a place field and take the first suggestion. The list only
    opens on focus + input (see PlaceCombobox.test.tsx), and the query is
    scoped to the field so another picker's options can never answer it. */
function pick(label: RegExp, query: string) {
  const input = screen.getByRole("combobox", { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  const rows = within(input.closest(".combo") as HTMLElement).getAllByRole("option");
  // rows commit on a tap — down and up in place — so a scroll is never a pick
  fireEvent.pointerDown(rows[0]);
  fireEvent.pointerUp(rows[0]);
  // a silent miss here would make every assertion below pass on the empty
  // card, so the selection is checked rather than assumed
  expect((input as HTMLInputElement).value).toContain(query);
}

const setTime = (name: RegExp, option: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("option", { name: option }));
};

describe("QuoteCard — the one door into the flow", () => {
  it("asks an airport pickup for its landing, not for a pickup time", async () => {
    mount();
    pick(/pickup/i, "Queen Beatrix");
    pick(/drop-off/i, "Ritz");

    // the label follows the route, and so does the field behind it
    expect(screen.getByRole("button", { name: /flight lands/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^pickup time/i })).toBeNull();

    setTime(/flight lands/i, /^2:00 PM$/);
    await waitFor(() => expect(screen.getByTestId("landing")).toHaveTextContent("14:00"));
    // and nothing was written to the hour the dispatcher would ignore
    expect(screen.getByTestId("pickup")).toBeEmptyDOMElement();
  });

  it("asks a departure for its take-off", async () => {
    mount();
    pick(/pickup/i, "Ritz");
    pick(/drop-off/i, "Queen Beatrix");

    expect(screen.getByRole("button", { name: /flight departs/i })).toBeInTheDocument();
    setTime(/flight departs/i, /^2:00 PM$/);
    await waitFor(() => expect(screen.getByTestId("dep")).toHaveTextContent("14:00"));
  });

  it("asks anywhere else for a plain pickup time", async () => {
    mount();
    pick(/pickup/i, "Ritz");
    pick(/drop-off/i, "Manchebo");

    expect(screen.getByRole("button", { name: /^pickup time/i })).toBeInTheDocument();
    setTime(/^pickup time/i, /^2:00 PM$/);
    await waitFor(() => expect(screen.getByTestId("pickup")).toHaveTextContent("14:00"));
  });

  it("will not open the flow without the hour — there is nowhere left to ask", async () => {
    mount();
    pick(/pickup/i, "Queen Beatrix");
    pick(/drop-off/i, "Ritz");

    fireEvent.click(screen.getByRole("button", { name: /view options/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/when does your flight land/i);
    expect(screen.getByTestId("open")).toHaveTextContent("false");

    setTime(/flight lands/i, /^2:00 PM$/);
    fireEvent.click(screen.getByRole("button", { name: /view options/i }));
    await waitFor(() => expect(screen.getByTestId("open")).toHaveTextContent("true"));
  });
});

// The reference's second state: touch a field and the card opens in place,
// the field's picker laid out in its body. These pin the ways in and out,
// and where focus is left — a close that drops focus to <body> strands a
// keyboard user at the top of the page.
describe("QuoteCard — opens in place, and closes back", () => {
  const card = () => document.querySelector(".qcard") as HTMLElement;
  const isOpen = () => card().classList.contains("is-open");

  it("rests closed, with nothing of the open body on the page", () => {
    mount();
    expect(isOpen()).toBe(false);
    expect(screen.queryByRole("region", { name: /trip details/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^close$/i })).toBeNull();
  });

  it("opens on a click into any field, and shows the welcome until a panel takes the body", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^date/i }));
    expect(isOpen()).toBe(true);
    expect(screen.getByRole("region", { name: /trip details/i })).toBeInTheDocument();
    // the calendar opened by the same click — the open card did not eat it
    expect(screen.getByRole("dialog", { name: /choose a date/i })).toBeInTheDocument();
  });

  it("opens on keyboard focus, for Tab and for the validator", () => {
    mount();
    fireEvent.focus(screen.getByRole("combobox", { name: /drop-off/i }));
    expect(isOpen()).toBe(true);
    // Aruba, not a count of countries — the welcome promises the island only
    expect(card().textContent).toMatch(/on the island|on Aruba/);
    expect(card().textContent).not.toMatch(/countries/i);
  });

  it("closes on Escape and leaves focus on the field it was opened from", () => {
    mount();
    const to = screen.getByRole("combobox", { name: /drop-off/i });
    // .focus() is not one of fireEvent's, so the state it sets is flushed
    // by hand
    act(() => to.focus());
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(to, { key: "Escape" });
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(to);
  });

  it("puts a picker away first: one Escape shuts the calendar, the next the card", () => {
    mount();
    const trigger = screen.getByRole("button", { name: /^date/i });
    fireEvent.click(trigger);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /choose a date/i })).toBeNull();
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from its Close button and hands focus back to the field", () => {
    mount();
    const trigger = screen.getByRole("button", { name: /^date/i });
    act(() => trigger.focus());
    expect(isOpen()).toBe(true);
    const close = screen.getByRole("button", { name: /^close$/i });
    expect(close).toHaveAttribute("aria-expanded", "true");
    act(() => close.focus());
    fireEvent.click(close);
    expect(isOpen()).toBe(false);
    // the button that had focus is gone; focus went back, not to <body>
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a tap outside it, and not on a press that started inside", () => {
    mount();
    const to = screen.getByRole("combobox", { name: /drop-off/i });
    fireEvent.focus(to);
    expect(isOpen()).toBe(true);
    // pressed on the field, released beside it — the open card moved under
    // the finger; that is not a tap outside
    fireEvent.pointerDown(to);
    fireEvent.pointerUp(document.body);
    expect(isOpen()).toBe(true);
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    expect(isOpen()).toBe(false);
  });

  it("offers only the trips the flow can book — no hourly hire", () => {
    mount();
    const group = screen.getByRole("group", { name: /trip type/i });
    const modes = within(group).getAllByRole("button").map((b) => b.textContent);
    expect(modes).toEqual(["One way", "Round trip"]);
    fireEvent.click(within(group).getByRole("button", { name: "Round trip" }));
    expect(within(group).getByRole("button", { name: "Round trip" })).toHaveAttribute("aria-pressed", "true");
  });
});
