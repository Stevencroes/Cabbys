// The card is the only door. The flow stopped asking for the route the
// moment the card became the only way in — so if any "Book now" on the site
// could still open it directly, someone would reach the fleet with nowhere
// to say where they were going and no field to say it in.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookingProvider, useBooking } from "./BookingContext";
import { useStartBooking, CARD_ID } from "./useStartBooking";
import { placeById, selFromPlace, AIRPORT } from "../data/places";

vi.mock("../lib/geo", () => ({
  isOnIsland: () => true,
  locate: async () => ({ ok: false, message: "" }),
}));

/** A stand-in for the card: the anchor, and an input to receive focus. */
function Card() {
  return (
    <div id={CARD_ID}>
      <input role="combobox" aria-label="From" defaultValue="" readOnly />
      <input role="combobox" aria-label="To" defaultValue="" readOnly />
    </div>
  );
}

function Harness({ route }: { route?: boolean }) {
  const start = useStartBooking();
  const { state, setField } = useBooking();
  return (
    <>
      <button onClick={() => {
        if (route) {
          setField("from", selFromPlace(AIRPORT));
          setField("to", selFromPlace(placeById("ritz")!));
        }
      }}>seed</button>
      <button onClick={() => start({ vehicle: "sprinter" })}>Book now</button>
      <output data-testid="open">{String(state.open)}</output>
      <output data-testid="vehicle">{state.vehicle}</output>
      <Card />
    </>
  );
}

const scrolled: HTMLElement[] = [];
beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function () { scrolled.push(this as HTMLElement); };
  // jsdom has no rAF timing of its own worth waiting on
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 0; });
});

function mount(route?: boolean) {
  render(
    <MemoryRouter>
      <BookingProvider><Harness route={route} /></BookingProvider>
    </MemoryRouter>,
  );
}

describe("useStartBooking", () => {
  it("sends a routeless Book now to the card instead of opening the flow", async () => {
    mount();
    fireEvent.click(screen.getByText("Book now"));

    await waitFor(() => expect(scrolled.map((e) => e.id)).toContain(CARD_ID));
    // the flow never opened — there would be nothing in it to answer
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    // and the cursor is in the field that is missing
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "From" }));
  });

  it("carries the car that was clicked, so the detour costs nothing", async () => {
    mount();
    fireEvent.click(screen.getByText("Book now"));
    await waitFor(() => expect(screen.getByTestId("vehicle")).toHaveTextContent("sprinter"));
  });

  it("opens the flow directly once the card has a route", async () => {
    mount(true);
    fireEvent.click(screen.getByText("seed"));
    fireEvent.click(screen.getByText("Book now"));

    await waitFor(() => expect(screen.getByTestId("open")).toHaveTextContent("true"));
    expect(scrolled).toHaveLength(0);
  });
});
