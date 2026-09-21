import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  clearFlightCache, NO_PROVIDER, useFlightProvider, type FlightStatus,
} from "../lib/flightStatus";
import TripFlight, { type FlightRide } from "./TripFlight";

// The canonical name, which is what a booking actually stores:
// Step3Details writes state.from.name, and pinPolicyFor matches on name.
// The short form ("Queen Beatrix Airport") does NOT resolve to a place,
// so a test written with it would exercise the address path and pass for
// the wrong reason.
const AUA = "Queen Beatrix International Airport";

const row = (over: Partial<FlightStatus> = {}): FlightStatus => ({
  flight: "KL765", alsoKnownAs: [], scheduled: "2026-09-17T21:55:00.000Z",
  estimated: null, predicted: null, actual: null, state: "scheduled",
  terminal: null, aircraft: null, airline: "KLM", live: true, ...over,
});

/** Every ride a guest has actually created: the pair, and no instant. */
const ride = (over: Partial<FlightRide> = {}): FlightRide => ({
  pickup_location: AUA,
  flight_number: "KL765",
  scheduled_date: "2026-09-17",
  scheduled_time: "18:30",
  ...over,
});

/** Records the day each lookup asked about, so the anchoring is checked
    rather than assumed. */
let asked: { flight: string; day: string }[] = [];

function answering(f: FlightStatus | null) {
  useFlightProvider({
    name: "t", enabled: true,
    lookup: async (flight, day) => { asked.push({ flight, day }); return f; },
  });
}

beforeEach(() => {
  useFlightProvider(NO_PROVIDER);
  clearFlightCache();
  asked = [];
});

describe("when nothing is known", () => {
  // The ordinary case — no key, nobody has asked yet, a mistyped number,
  // the month's budget gone. It has to look calm, not broken.
  it("renders nothing rather than an empty box", async () => {
    const { container } = render(<TripFlight ride={ride()} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when the guest never gave a flight number", async () => {
    answering(row());
    const { container } = render(<TripFlight ride={ride({ flight_number: null })} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(asked).toHaveLength(0);
  });

  it("never asks about something that isn't a flight number", async () => {
    answering(row());
    const { container } = render(
      <TripFlight ride={ride({ flight_number: "I'll text it to you" })} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(asked).toHaveLength(0);
  });
});

// The shape the product actually produces. bookingPayload.ts writes
// scheduled_date + scheduled_time and leaves scheduled_at null on every
// row the booking flow has ever created — reading scheduled_at here is
// exactly how the pin button shipped invisible to everybody, and the
// tests of the day missed it by handing the component an instant.
describe("the time shape a booking really writes", () => {
  it("works off scheduled_date + scheduled_time with no scheduled_at at all", async () => {
    answering(row());
    render(<TripFlight ride={ride()} />);
    expect(await screen.findByText("Lands 5:55 PM")).toBeInTheDocument();
  });

  it("asks about the Aruba day, not the browser's", async () => {
    answering(row());
    // 11pm on the island is already tomorrow in UTC, and in most of the
    // timezones a guest checks this page from.
    render(<TripFlight ride={ride({ scheduled_time: "23:00" })} />);
    await screen.findByText("Lands 5:55 PM");
    expect(asked).toEqual([{ flight: "KL765", day: "2026-09-17" }]);
  });

  it("still reads an instant on a row that carries one", async () => {
    answering(row());
    render(
      <TripFlight
        ride={{
          pickup_location: AUA,
          flight_number: "KL765",
          scheduled_at: "2026-09-17T22:30:00.000Z",
        }}
      />,
    );
    expect(await screen.findByText("Lands 5:55 PM")).toBeInTheDocument();
  });
});

describe("which pickups get a line at all", () => {
  // A run TO the airport carries a DEPARTURE number. Looking it up as an
  // arrival gets a null at best and yesterday's inbound leg at worst.
  it("says nothing on a run to the airport, and doesn't pay to find out", async () => {
    answering(row());
    const { container } = render(
      <TripFlight ride={ride({ pickup_location: "Manchebo Beach Resort" })} />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(asked).toHaveLength(0);
  });
});

describe("what the guest reads", () => {
  it("shows the time and that we are watching it, with no colour", async () => {
    answering(row());
    const { container } = render(<TripFlight ride={ride()} />);
    expect(await screen.findByText("Lands 5:55 PM")).toBeInTheDocument();
    expect(container.querySelector(".tp-flight")).toHaveClass("quiet");
    // The sentence the driver's line doesn't have, and the only reason
    // this box is on a calm traveller's card.
    expect(screen.getByText(/watching this flight too/i)).toBeInTheDocument();
  });

  // The guest is holding the boarding pass the number came off. The card's
  // .tp-meta keeps their own typed "Flight KL765"; this doesn't repeat it.
  it("doesn't repeat the flight number back at them", async () => {
    answering(row());
    render(<TripFlight ride={ride()} />);
    await screen.findByText("Lands 5:55 PM");
    expect(screen.queryByText("KL765")).toBeNull();
  });

  it("leads with the new time when the airline moved it, and says we have it", async () => {
    answering(row({ estimated: "2026-09-17T22:40:00.000Z" }));
    const { container } = render(<TripFlight ride={ride()} />);
    expect(await screen.findByText("Now lands 6:40 PM")).toBeInTheDocument();
    expect(container.querySelector(".tp-flight")).toHaveClass("warn");
    expect(screen.getByText(/Scheduled 5:55 PM/)).toBeInTheDocument();
    expect(screen.getByText(/so has your driver/i)).toBeInTheDocument();
    // A moved time is not an emergency. It must not interrupt a screen
    // reader, and it must not be the alert colour.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Where the guest and the driver deliberately part. The driver's line
  // goes warn on a model-only prediction because they may leave early on
  // it; the guest's headline has not moved, so neither does its colour.
  it("stays quiet when only the tracking model has spoken", async () => {
    answering(row({ predicted: "2026-09-17T21:40:00.000Z" }));
    const { container } = render(<TripFlight ride={ride()} />);
    expect(await screen.findByText("Lands 5:55 PM")).toBeInTheDocument();
    expect(container.querySelector(".tp-flight")).toHaveClass("quiet");
    expect(screen.getByText(/Tracking expects 5:40 PM/)).toBeInTheDocument();
  });

  // The clock still follows the best time anyone has; what the threshold
  // holds back is the commentary. Eight minutes gets no colour, no
  // "moved", and no reason to reach for a phone.
  it("says nothing about a drift too small to matter from a departure gate", async () => {
    answering(row({ estimated: "2026-09-17T22:03:00.000Z" }));
    const { container } = render(<TripFlight ride={ride()} />);
    expect(await screen.findByText("Lands 6:03 PM")).toBeInTheDocument();
    expect(container.querySelector(".tp-flight")).toHaveClass("quiet");
    expect(screen.queryByText(/8 min|moved/i)).toBeNull();
  });

  it("reports a landing without counting the minutes back at them", async () => {
    answering(row({ actual: "2026-09-17T22:25:00.000Z", state: "landed" }));
    render(<TripFlight ride={ride()} />);
    expect(await screen.findByText("Landed 6:25 PM")).toBeInTheDocument();
    expect(screen.queryByText(/30 min late/)).toBeNull();
  });
});

// The only state loud enough to announce itself, because it is the only
// one where the guest has something to do.
describe("when there is no flight to meet", () => {
  it("announces a cancellation and points at the way to reach us", async () => {
    answering(row({ state: "cancelled" }));
    const { container } = render(<TripFlight ride={ride()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Flight cancelled/);
    expect(container.querySelector(".tp-flight")).toHaveClass("alert");
    expect(screen.getByText(/Message us/)).toBeInTheDocument();
    // Named here and nowhere else: the one moment it is worth the guest
    // checking they typed their own flight.
    expect(screen.getByText(/KL765/)).toBeInTheDocument();
    // and never the driver's instruction
    expect(screen.queryByText(/Don't drive/)).toBeNull();
  });

  it("announces a diversion", async () => {
    answering(row({ state: "diverted" }));
    render(<TripFlight ride={ride()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Flight diverted/);
    expect(screen.getByText(/isn't landing in Aruba/)).toBeInTheDocument();
  });
});
