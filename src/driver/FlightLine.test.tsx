import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearFlightCache, NO_PROVIDER, useFlightProvider, type FlightStatus,
} from "../lib/flightStatus";
import FlightLine from "./FlightLine";

const row = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL765", alsoKnownAs: [], scheduled: "2026-09-17T21:55:00.000Z",
  estimated: null, predicted: null, actual: null, state: "scheduled",
  terminal: null, aircraft: null, airline: "KLM", live: true, ...over,
});

function answering(f: FlightStatus | null) {
  useFlightProvider({ name: "t", enabled: true, lookup: async () => f });
}

const AT = "2026-09-17T21:55:00.000Z";

beforeEach(() => { useFlightProvider(NO_PROVIDER); clearFlightCache(); });

describe("when nothing is known", () => {
  // The ordinary case, and it stays the ordinary case. The guest's own
  // typed line is what the screen shows, exactly as it does today.
  it("renders nothing rather than an empty box", async () => {
    const { container } = render(<FlightLine flightNumber="KL765" scheduledAt={AT} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("never asks about something that isn't a flight number", async () => {
    let asked = false;
    useFlightProvider({
      name: "t", enabled: true,
      lookup: async () => { asked = true; return row(); },
    });
    const { container } = render(
      <FlightLine flightNumber="I'll text you my flight" scheduledAt={AT} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(asked).toBe(false);
  });

  it("renders nothing with no flight number at all", async () => {
    answering(row());
    const { container } = render(<FlightLine flightNumber={null} scheduledAt={AT} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("what the driver reads", () => {
  it("is one quiet line when the flight is on time", async () => {
    answering(row());
    const { container } = render(<FlightLine flightNumber="KL765" scheduledAt={AT} />);
    expect(await screen.findByText("Lands 5:55 PM")).toBeInTheDocument();
    expect(container.querySelector(".drv-flight")).toHaveClass("quiet");
    expect(screen.getByText("KL765")).toBeInTheDocument();
  });

  it("leads with the new time when the airline moved it", async () => {
    answering(row({ estimated: "2026-09-17T22:40:00.000Z" }));
    const { container } = render(<FlightLine flightNumber="KL765" scheduledAt={AT} />);
    expect(await screen.findByText("Now lands 6:40 PM")).toBeInTheDocument();
    expect(container.querySelector(".drv-flight")).toHaveClass("warn");
  });

  // The live call's own numbers. The headline stays the time somebody
  // promised; the model gets a sentence with its name on it.
  it("keeps the promised time when only the model has spoken", async () => {
    answering(row({ predicted: "2026-09-17T21:40:00.000Z" }));
    render(<FlightLine flightNumber="KL765" scheduledAt={AT} />);
    expect(await screen.findByText("Lands 5:55 PM")).toBeInTheDocument();
    expect(screen.getByText(/Tracking expects 5:40 PM/)).toBeInTheDocument();
  });

  // The two states that mean "do not drive to this yet" — the only two
  // allowed to be loud, and the only one that announces itself.
  it("shouts about a cancellation and tells the driver not to go", async () => {
    answering(row({ state: "cancelled" }));
    const { container } = render(<FlightLine flightNumber="KL765" scheduledAt={AT} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Flight cancelled/);
    expect(container.querySelector(".drv-flight")).toHaveClass("alert");
    expect(screen.getByText(/Don't drive/)).toBeInTheDocument();
  });

  it("does not announce an ordinary on-time flight", async () => {
    answering(row());
    render(<FlightLine flightNumber="KL765" scheduledAt={AT} />);
    await screen.findByText("Lands 5:55 PM");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
