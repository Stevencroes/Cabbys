// The card is now the only place the trip is described, so what it asks has
// to be complete — and it has to ask the RIGHT hour. An airport pickup is
// timed off the landing and a departure off the take-off; a "pickup time"
// on either would be a number the dispatcher throws away, collected from
// someone who then gets asked for their flight anyway.
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
    scoped to it because the passengers <select> also has option roles. */
function pick(label: RegExp, query: string) {
  const input = screen.getByRole("combobox", { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: query } });
  // scoped to this field: the passengers <select> answers option/listbox too
  const rows = within(input.closest(".combo") as HTMLElement).getAllByRole("option");
  // rows commit on pointerdown, ahead of the blur a click would cause
  fireEvent.pointerDown(rows[0]);
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
    pick(/from/i, "Queen Beatrix");
    pick(/to/i, "Ritz");

    // the label follows the route, and so does the field behind it
    expect(screen.getByRole("button", { name: /flight lands/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^time/i })).toBeNull();

    setTime(/flight lands/i, /^2:00 PM$/);
    await waitFor(() => expect(screen.getByTestId("landing")).toHaveTextContent("14:00"));
    // and nothing was written to the hour the dispatcher would ignore
    expect(screen.getByTestId("pickup")).toBeEmptyDOMElement();
  });

  it("asks a departure for its take-off", async () => {
    mount();
    pick(/from/i, "Ritz");
    pick(/to/i, "Queen Beatrix");

    expect(screen.getByRole("button", { name: /flight departs/i })).toBeInTheDocument();
    setTime(/flight departs/i, /^2:00 PM$/);
    await waitFor(() => expect(screen.getByTestId("dep")).toHaveTextContent("14:00"));
  });

  it("asks anywhere else for a plain pickup time", async () => {
    mount();
    pick(/from/i, "Ritz");
    pick(/to/i, "Manchebo");

    expect(screen.getByRole("button", { name: /^time/i })).toBeInTheDocument();
    setTime(/^time/i, /^2:00 PM$/);
    await waitFor(() => expect(screen.getByTestId("pickup")).toHaveTextContent("14:00"));
  });

  it("will not open the flow without the hour — there is nowhere left to ask", async () => {
    mount();
    pick(/from/i, "Queen Beatrix");
    pick(/to/i, "Ritz");

    fireEvent.click(screen.getByRole("button", { name: /check availability/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/when does your flight land/i);
    expect(screen.getByTestId("open")).toHaveTextContent("false");

    setTime(/flight lands/i, /^2:00 PM$/);
    fireEvent.click(screen.getByRole("button", { name: /check availability/i }));
    await waitFor(() => expect(screen.getByTestId("open")).toHaveTextContent("true"));
  });
});
