import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearFlightCache, NO_PROVIDER, useFlightProvider, type FlightStatus,
} from "../lib/flightStatus";
import RideFlight from "./RideFlight";
import { makeRide } from "./lib/fixtures";

/** The canonical name, which is what a booking stores and what
    findPlaceByName matches. "Queen Beatrix Airport" resolves to nothing
    and would quietly exercise the address path. */
const AUA = "Queen Beatrix International Airport";

const row = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL765", alsoKnownAs: [], scheduled: "2026-09-17T21:55:00.000Z",
  estimated: null, predicted: null, actual: null, state: "scheduled",
  terminal: null, aircraft: null, airline: "KLM", live: true, ...over,
});

const ride = (over = {}) => makeRide({
  pickup: AUA, flightNumber: "KL765", scheduledAt: "2026-09-17T21:55:00.000Z", ...over,
});

let asked: { flight: string; day: string }[] = [];

function answering(f: FlightStatus | null) {
  useFlightProvider({
    name: "t", enabled: true,
    lookup: async (flight, day) => { asked.push({ flight, day }); return f; },
  });
}

beforeEach(() => { useFlightProvider(NO_PROVIDER); clearFlightCache(); asked = []; });

describe("when nothing is known", () => {
  // Most rides on most boards. The Flight fact keeps the number the
  // guest typed and nothing else, exactly as it did before this existed.
  it("renders nothing rather than an empty box", async () => {
    const { container } = render(<RideFlight ride={ride()} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // A departure looked up as an arrival is either nothing or, worse,
  // that morning's inbound leg shown as tonight's landing.
  it("never asks about a run to the airport", async () => {
    answering(row({ state: "cancelled" }));
    const { container } = render(
      <RideFlight ride={ride({ pickup: "The Ritz-Carlton Aruba", dropoff: AUA })} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(asked).toHaveLength(0);
  });
});

describe("what an operator sees before acting", () => {
  // The state is a WORD. The tint is the second signal, for the operator
  // who cannot pick the clay out of the teal at five in the morning.
  it("says the flight is cancelled, in words, and marks it alert", async () => {
    answering(row({ state: "cancelled" }));
    const { container } = render(<RideFlight ride={ride()} />);
    await screen.findByText("Flight cancelled");
    expect(container.querySelector(".adm-flight.alert")).not.toBeNull();
  });

  // The timetable is the one number nobody revises, and it is what the
  // booking was planned against — so it stays on screen under the
  // revision rather than being replaced by it.
  it("keeps the scheduled time under a time the airline moved", async () => {
    answering(row({ estimated: "2026-09-17T23:30:00.000Z" }));
    render(<RideFlight ride={ride()} />);
    await screen.findByText(/Now lands/);
    expect(screen.getByText(/Scheduled/)).toBeInTheDocument();
  });

  // No advice. Both existing audiences address somebody heading to the
  // airport; an operator reading "check with Cabby's" about their own
  // company is a sentence written for a different reader.
  it("states the fact and gives no instructions", async () => {
    answering(row({ state: "cancelled" }));
    const { container } = render(<RideFlight ride={ride()} />);
    await screen.findByText("Flight cancelled");
    expect(container.textContent).not.toMatch(/Cabby's/);
    expect(container.textContent).not.toMatch(/Don't drive/);
  });
});
