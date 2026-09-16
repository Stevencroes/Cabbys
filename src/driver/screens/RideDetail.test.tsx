import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state: { ride: unknown; status: unknown; release: unknown } = {
  ride: null,
  status: { ok: true },
  release: { ok: true },
};
const statusCalls: [string, string][] = [];
const released: [string, string][] = [];
const navigate = vi.fn();

vi.mock("../lib/driver", async (orig) => ({
  ...(await orig<typeof import("../lib/driver")>()),
  loadRide: () => Promise.resolve(state.ride),
  setRideStatus: (id: string, s: string) => {
    statusCalls.push([id, s]);
    return Promise.resolve(state.status);
  },
  releaseRide: (id: string, why: string) => {
    released.push([id, why]);
    return Promise.resolve(state.release);
  },
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useParams: () => ({ id: "r1" }),
  useNavigate: () => navigate,
}));

import RideDetail from "./RideDetail";

const ride = (over: Record<string, unknown> = {}) => ({
  id: "r1", status: "driver_assigned", scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup: "Queen Beatrix International Airport", dropoff: "Bucuti & Tara",
  vehicle: "The Voyager", passengers: 4, luggage: 5, childSeats: 1,
  // ƒ104 is the guest's fare; three quarters of it, in dollars, is $43.58
  fareAwg: 104, payoutUsd: (104 / 1.79) * 0.75, bookingRef: "CBY-4417",
  contactName: "Steven Croes", contactPhone: "+2975607336", flightNumber: "KL767",
  pickupLat: 12.55, pickupLng: -70.05, pickupNote: "Blue umbrella, left of the pier",
  bookingNotes: null, arrivedAt: null, startedAt: null,
  ...over,
});

const renderDetail = () => render(<MemoryRouter><RideDetail /></MemoryRouter>);

beforeEach(() => {
  state.ride = ride();
  state.status = { ok: true };
  state.release = { ok: true };
  statusCalls.length = 0;
  released.length = 0;
  navigate.mockClear();
});

describe("Ride detail", () => {
  // The screen has said this in its own header since it was written —
  // coordinates get you within 20 metres, the landmark closes the last 20
  // — and rendered the opposite: the note sat under the map, below the
  // fold on a phone. PRECEDING is the note coming FIRST in the DOM.
  it("puts the guest note above the map, because the landmark closes the last 20 metres", async () => {
    renderDetail();
    const note = await screen.findByText(/blue umbrella, left of the pier/i);
    const map = document.querySelector(".drv-pinmap")!;
    expect(map.compareDocumentPosition(note)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    // it's the amber card, set larger than anything else on the screen
    expect(note.closest(".drv-note")).not.toBeNull();
  });

  it("deep-links Maps to the guest's pin, not the place name", async () => {
    renderDetail();
    const maps = await screen.findByRole("link", { name: /navigate/i });
    expect(maps).toHaveAttribute(
      "href", "https://www.google.com/maps/dir/?api=1&destination=12.55%2C-70.05");
  });

  // v8. This was maps.google.com/?daddr=, Google's pre-2017 link — fine
  // in a desktop browser and unreliable on the device the button exists
  // for: a web redirect instead of the Maps app on iOS, and from a portal
  // added to the home screen a blank standalone tab with no address bar.
  // /maps/dir/?api=1 is the documented cross-platform form.
  it("uses the URL form Google supports on a phone", async () => {
    renderDetail();
    const maps = await screen.findByRole("link", { name: /navigate/i });
    const href = maps.getAttribute("href")!;
    expect(href.startsWith("https://www.google.com/maps/dir/?api=1&destination=")).toBe(true);
    expect(href).not.toContain("daddr");
  });

  // rides.pickup_lat/lng are columns nothing in this app has ever written
  // — the guest-drops-a-pin flow was specified and never built — so this
  // is not the edge case, it is every ride. The pickup's own name is the
  // best location we hold, and the catalog knows where its places are.
  it("maps the place it was told to collect from when no pin was dropped", async () => {
    state.ride = ride({ pickupLat: null, pickupLng: null, pickupNote: null });
    renderDetail();
    const maps = await screen.findByRole("link", { name: /navigate/i });
    // the NAME still wins the deep link: Google resolves it to the door,
    // where an area centre would send the driver to the middle of a beach
    expect(maps.getAttribute("href")).toContain("Queen%20Beatrix");
    // and the badge never claims a pin nobody dropped
    expect(await screen.findByText(/approximate — from the address/i)).toBeInTheDocument();
    expect(screen.queryByText(/guest pinned/i)).toBeNull();
  });

  it("says so plainly when it has no idea where the pickup is", async () => {
    state.ride = ride({
      pickup: "A villa with no name", pickupLat: null, pickupLng: null, pickupNote: null,
    });
    renderDetail();
    expect(await screen.findByText(/no location/i)).toBeInTheDocument();
  });

  // "Guest pinned" is a claim about provenance, not about having a map.
  it("reserves the pinned badge for a pin a guest actually dropped", async () => {
    renderDetail();
    expect(await screen.findByText(/guest pinned/i)).toBeInTheDocument();
  });

  // One primary action per screen, and every step but the last is a tap.
  // The last one ends the job, closes the money and drops the driver back
  // to the roster, so it is the only one that asks first.
  it("asks before completing, and not before anything else", async () => {
    state.ride = ride({ status: "in_progress" });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /complete trip/i }));
    expect(statusCalls).toEqual([]);
    expect(screen.getByText(/complete this ride\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));
    await waitFor(() => expect(statusCalls).toEqual([["r1", "completed"]]));
  });

  it("walks the status forward one step per tap", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /i'm on my way/i }));
    await waitFor(() => expect(statusCalls).toEqual([["r1", "en_route"]]));
  });

  it("names the next action for each status in the flow", async () => {
    for (const [status, label] of [
      ["en_route", /i've arrived/i],
      ["arrived", /guest is aboard/i],
      ["in_progress", /complete trip/i],
    ] as const) {
      state.ride = ride({ status });
      const { unmount } = renderDetail();
      expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the guest's contact only because this ride is already theirs", async () => {
    renderDetail();
    expect(await screen.findByText("Steven Croes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /call steven croes/i })).toHaveAttribute("href", "tel:+2975607336");
  });

  // This route renders bare — no top bar, no tabs — so before this there
  // was no way off the screen that wasn't finishing the job. A driver who
  // opened a ride they'd claimed for Friday was simply stuck in it.
  it("can be left without completing the job", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /back to the schedule/i }));
    expect(navigate).toHaveBeenCalledWith("/drive");
  });

  // A refused step used to be swallowed whole: setRideStatus returned a
  // bare false, the button un-pressed itself, and the ride stayed put
  // with nothing on screen to explain why.
  it("says why a step was refused instead of looking like a dead button", async () => {
    state.status = { ok: false, detail: "This job isn't yours any more." };
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /i'm on my way/i }));
    expect(await screen.findByText(/this job isn't yours any more/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  // set_ride_status() won't accept 'driver_assigned', so "I'm on my way"
  // is the one tap with no way back — and the screen must not offer an
  // undo the database would refuse.
  it("offers one step back where the database allows one, and not where it doesn't", async () => {
    state.ride = ride({ status: "arrived" });
    const first = renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /undo/i }));
    await waitFor(() => expect(statusCalls).toEqual([["r1", "en_route"]]));
    first.unmount();

    state.ride = ride({ status: "en_route" });
    renderDetail();
    expect(await screen.findByRole("button", { name: /i've arrived/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  // Step3Details has always written this column and nothing has ever read
  // it. A villa pickup's entire usable detail — the typed address, the
  // guest's own note about it, the child seats' ages, the flight's landing
  // time — was sitting in `rides.notes` being ignored.
  it("shows what the booking was told, as facts rather than a paragraph", async () => {
    state.ride = ride({
      bookingNotes:
        "Pickup address: Villa Sunrise 14 (blue gate, past the second speed bump) · area Palm Beach"
        + " · Child seats: 1 (ages 3) · Flight lands 2:35 PM AST · We have a surfboard",
    });
    renderDetail();
    expect(await screen.findByText(/blue gate, past the second speed bump/)).toBeInTheDocument();
    expect(screen.getByText("Child seats: 1 (ages 3)")).toBeInTheDocument();
    expect(screen.getByText("We have a surfboard")).toBeInTheDocument();
    // one per line, not one grey sentence
    expect(document.querySelectorAll(".drv-told li")).toHaveLength(5);
  });

  // release_ride() appends its reason to rides.notes — the same column
  // the booking was written into — so the next driver to claim a handed
  // back ride was reading the LAST driver's excuse under a heading that
  // said "What the guest told us". Attributing "Car won't start" to a
  // guest is worse than not showing it at all.
  it("does not put a previous driver's words in the guest's mouth", async () => {
    state.ride = ride({
      bookingNotes: "Flight departs 9:15 AM AST · Returned to pool: Car won't start",
    });
    renderDetail();

    const guest = (await screen.findByText(/what the guest told us/i)).closest(".drv-told")!;
    expect(guest.textContent).toContain("Flight departs 9:15 AM AST");
    expect(guest.textContent).not.toContain("Car won't start");

    // shown, not suppressed: a job handed back once is a job to arrive at
    // differently, and the reason is worth reading
    const back = screen.getByText(/handed back once/i).closest(".drv-told")!;
    expect(back.textContent).toContain("Car won't start");
    expect(back).toHaveClass("back");
  });

  it("counts the handbacks when a job has bounced more than once", async () => {
    state.ride = ride({
      bookingNotes: "Returned to pool: Car won't start · Returned to pool: Nobody at the address",
    });
    renderDetail();
    expect(await screen.findByText(/handed back 2 times/i)).toBeInTheDocument();
    // and with nothing left, the guest's block does not draw an empty card
    expect(screen.queryByText(/what the guest told us/i)).toBeNull();
  });

  it("says nothing at all when the booking said nothing", async () => {
    state.ride = ride({ bookingNotes: null });
    renderDetail();
    await screen.findByText("Steven Croes");
    expect(document.querySelector(".drv-told")).toBeNull();
  });

  // A cancelled ride is reachable from the roster now, and it used to
  // render as a normal job with a quiet Back button — every control still
  // there, nothing saying it had been called off.
  it("says a called-off ride is called off, before anything else", async () => {
    state.ride = ride({ status: "cancelled" });
    renderDetail();
    expect(await screen.findByText(/this ride was called off/i)).toBeInTheDocument();
    // and offers none of the walk: no step, no undo, no handback
    expect(screen.queryByRole("button", { name: /i'm on my way/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /can't do this job/i })).toBeNull();
    // the top bar and the action bar both offer the way out
    expect(screen.getAllByRole("button", { name: /back to the schedule/i }).length).toBeGreaterThan(0);
  });

  // §6/§8 — the driver must not be left to interpret an address. This is
  // Cabby's knowledge, not something a guest was asked to type.
  it("spells out where the car actually stops", async () => {
    state.ride = ride({ pickup: "Queen Beatrix International Airport" });
    renderDetail();
    expect(await screen.findByText(/arrivals — transfer pickup area/i)).toBeInTheDocument();
    expect(screen.getByText(/not the taxi rank/i)).toBeInTheDocument();
  });

  // §11 — the moment the guest is aboard, the pickup is history. A driver
  // with somebody in the back was being shown directions to where they
  // had just been.
  it("turns to face the destination once the guest is aboard", async () => {
    state.ride = ride({ status: "in_progress" });
    renderDetail();
    expect(await screen.findByText("Destination")).toBeInTheDocument();
    // the rowset below still lists both ends for reference — it is the
    // LEAD that turns around
    expect(document.querySelector(".drv-where .wk")?.textContent).toBe("Destination");
    // and Navigate goes to where they are going, not where they were
    expect(screen.getByRole("link", { name: /navigate/i }).getAttribute("href"))
      .toContain(encodeURIComponent("Bucuti & Tara"));
  });

  // §18 — nothing in this app tracks a flight. Saying "tracked" is the
  // difference between a driver checking the board and one who believes
  // we will tell them.
  it("does not claim to be tracking a flight it cannot see", async () => {
    renderDetail();
    expect(await screen.findByText("KL767")).toBeInTheDocument();
    expect(screen.queryByText(/tracked/i)).toBeNull();
  });

  // §10 — "the driver says they waited twenty minutes" and "the guest says
  // the car was late" are two claims with nothing between them.
  it("shows the arrival it recorded, so the wait is a fact and not a claim", async () => {
    state.ride = ride({ status: "arrived", arrivedAt: "2026-09-01T18:31:00.000Z" });
    renderDetail();
    expect(await screen.findByText("You arrived")).toBeInTheDocument();
    expect(screen.getByText("2:31 PM")).toBeInTheDocument();
  });

  // Claiming was one-way: a driver whose car wouldn't start held a job
  // nobody else could see, while the pool showed nothing and dispatch
  // knew nothing.
  it("can hand a job back, with a reason dispatch can read", async () => {
    state.ride = ride({ scheduledAt: new Date(Date.now() + 6 * 3600_000).toISOString() });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /can't do this job/i }));
    fireEvent.change(screen.getByLabelText(/why you can't do it/i), {
      target: { value: "Car won't start" },
    });
    fireEvent.click(screen.getByRole("button", { name: /hand it back/i }));
    await waitFor(() => expect(released).toEqual([["r1", "Car won't start"]]));
    // the pool is told which ride to expect, so it can outwait the lag
    expect(navigate).toHaveBeenCalledWith("/drive/pool", { state: { released: "r1" } });
  });

  // Inside the two-hour window a handback stops being scheduling and
  // becomes a no-show — that needs a person, so the button is not there
  // to be refused.
  it("does not offer a handback the database would refuse", async () => {
    state.ride = ride({ scheduledAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    renderDetail();
    await screen.findByText("Steven Croes");
    expect(screen.queryByRole("button", { name: /can't do this job/i })).toBeNull();
  });

  it("won't hand back on a blank reason", async () => {
    state.ride = ride({ scheduledAt: new Date(Date.now() + 6 * 3600_000).toISOString() });
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: /can't do this job/i }));
    expect(screen.getByRole("button", { name: /hand it back/i })).toBeDisabled();
    expect(released).toEqual([]);
  });

  // The money rows are the other half of the pool's fix: the driver's
  // payout leads, the guest's total is named as the guest's.
  it("leads with the payout and labels the guest's fare as the guest's", async () => {
    renderDetail();
    expect(await screen.findByText("$44")).toBeInTheDocument();  // (104 / 1.79) × 0.75
    expect(screen.getByText("You earn")).toBeInTheDocument();
    expect(screen.getByText(/Guest pays/)).toBeInTheDocument();
  });
});
