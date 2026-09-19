import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("../lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import PickupPin from "./PickupPin";

const AT = "2026-09-20T18:00:00.000Z";
const DURING = Date.parse(AT) - 30 * 60_000;
const WEEKS_EARLY = Date.parse(AT) - 21 * 24 * 60 * 60_000;

// The shape a real booking has: scheduled_date + scheduled_time, Aruba
// wall clock, scheduled_at null. Every test in this file used to pass a
// scheduled_at instead, which is why they all stayed green while the
// button never once appeared in production — the fixture was a shape
// bookingPayload.ts has never written. 14:00 on the island is AT.
const ride = (over: Partial<Parameters<typeof PickupPin>[0]["ride"]> = {}) => ({
  id: "r1",
  pickup_location: "Kamay 14-B, Noord",
  scheduled_date: "2026-09-20",
  scheduled_time: "14:00",
  ...over,
});

function geolocation(answer: { lat: number; lng: number } | { code: number }) {
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (p: unknown) => void, bad: (e: unknown) => void) => {
        if ("code" in answer) bad({ code: answer.code });
        else ok({ coords: { latitude: answer.lat, longitude: answer.lng } });
      },
    },
  });
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("what each kind of pickup is asked", () => {
  // One transfer bay, an exact point already on file, and a guest who is
  // not there yet. There is no question, so there is no card.
  it("asks the airport nothing at all", () => {
    const { container } = render(
      <PickupPin ride={ride({ pickup_location: "Queen Beatrix International Airport" })} now={DURING} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // A resort's name already resolves to its door. What costs ten minutes
  // is which entrance, and that is a sentence, not a coordinate.
  it("asks a resort which entrance, and never for a coordinate", () => {
    render(<PickupPin ride={ride({ pickup_location: "Eagle Aruba Resort" })} now={DURING} />);
    expect(screen.getByText(/which entrance/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send my exact spot/i })).toBeNull();
  });

  it("offers an address the spot, once the pickup is close", () => {
    render(<PickupPin ride={ride()} now={DURING} />);
    expect(screen.getByRole("button", { name: /i'm here — send my exact spot/i })).toBeInTheDocument();
  });

  // The point of the window. Three weeks out the guest is at home, and a
  // coordinate captured there is not a rough pin, it is a wrong one.
  it("won't take a spot weeks before the trip, but still takes a landmark", () => {
    render(<PickupPin ride={ride()} now={WEEKS_EARLY} />);
    expect(screen.queryByRole("button", { name: /send my exact spot/i })).toBeNull();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText(/closer to your pickup/i)).toBeInTheDocument();
  });
});

describe("sending", () => {
  it("sends the coordinate the phone gave it", async () => {
    geolocation({ lat: 12.5772, lng: -70.0522 });
    render(<PickupPin ride={ride()} now={DURING} />);
    fireEvent.click(screen.getByRole("button", { name: /send my exact spot/i }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_pickup_pin", {
      p_ride_id: "r1", p_lat: 12.5772, p_lng: -70.0522, p_note: null,
    }));
    expect(await screen.findByText(/exactly where you are/i)).toBeInTheDocument();
  });

  // The phone answered, and the answer was Newark. Refused before the
  // round trip, and the guest is told what to do instead.
  it("refuses a fix that isn't on the island and says why", async () => {
    geolocation({ lat: 40.6895, lng: -74.1745 });
    render(<PickupPin ride={ride()} now={DURING} />);
    fireEvent.click(screen.getByRole("button", { name: /send my exact spot/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't in Aruba/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  // A blocked permission is not a dead button. It is a sentence with the
  // alternative in it, and the alternative stays on screen.
  it("names a blocked permission and leaves the landmark open", async () => {
    geolocation({ code: 1 });
    render(<PickupPin ride={ride()} now={DURING} />);
    fireEvent.click(screen.getByRole("button", { name: /send my exact spot/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/blocking location/i);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("sends a landmark on its own", async () => {
    render(<PickupPin ride={ride()} now={WEEKS_EARLY} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Blue gate, opposite the pharmacy" } });
    fireEvent.click(screen.getByRole("button", { name: /send to driver/i }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_pickup_pin", {
      p_ride_id: "r1", p_lat: null, p_lng: null, p_note: "Blue gate, opposite the pharmacy",
    }));
  });

  it("shows the refusal rather than a quiet nothing", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "already_cancelled" }, error: null });
    render(<PickupPin ride={ride()} now={WEEKS_EARLY} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /send to driver/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cancelled/i);
  });
});

// Rides written before the date/time pair existed, and anything the
// admin side stores as an instant, still have to work.
describe("a ride that carries an instant instead of a pair", () => {
  it("opens the window off scheduled_at", () => {
    render(
      <PickupPin
        ride={{ id: "r1", pickup_location: "Kamay 14-B, Noord", scheduled_at: AT }}
        now={DURING}
      />,
    );
    expect(screen.getByRole("button", { name: /send my exact spot/i })).toBeTruthy();
  });

  it("offers the note but not the spot when the row has no time at all", () => {
    render(<PickupPin ride={{ id: "r1", pickup_location: "Kamay 14-B, Noord" }} now={DURING} />);
    expect(screen.queryByRole("button", { name: /send my exact spot/i })).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
