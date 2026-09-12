import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const state: { open: unknown[] } = { open: [] };
let polls = 0;

vi.mock("./lib/driver", async (orig) => ({
  ...(await orig<typeof import("./lib/driver")>()),
  loadOpen: () => { polls++; return Promise.resolve({ jobs: state.open, error: null }); },
  claimRide: () => Promise.resolve({ ok: true, rideId: "r1" }),
}));

import { useRideOffers } from "./useRideOffers";

const job = (id: string) => ({
  id, status: "confirmed", scheduledAt: "2026-09-01T18:35:00.000Z",
  pickup: "Queen Beatrix International Airport", dropoff: "Eagle Beach",
  vehicle: "The Scout", passengers: 2, luggage: 1, childSeats: 0,
  fareAwg: 89.5, payoutUsd: 37.5, bookingRef: "CB-1",
});

/** jsdom reports "visible" and offers no way to set it — stand in for it. */
function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => { state.open = []; polls = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); setVisibility("visible"); });

describe("Watching the pool", () => {
  it("adopts the backlog silently — opening the app never chimes at a queue", async () => {
    state.open = [job("old")];
    const { result } = renderHook(() => useRideOffers(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.offer).toBeNull();

    // one that arrives AFTER the watch started is an interruption
    state.open = [job("old"), job("new")];
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(result.current.offer?.id).toBe("new");
  });

  it("does not ask at all while the driver is offline", async () => {
    renderHook(() => useRideOffers(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(polls).toBe(0);
  });

  // A phone in a mount for a ten-hour shift asked three thousand times,
  // most of them with the screen off. An offer is an interruption, and
  // there is nobody behind another app to interrupt.
  it("stands down once the portal has been out of sight for a while", async () => {
    renderHook(() => useRideOffers(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const atStart = polls;

    act(() => setVisibility("hidden"));
    // inside the grace period it keeps watching — switching to Maps
    // mid-job must not drop the watch
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(polls).toBeGreaterThan(atStart);

    const beforeSleep = polls;
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    const asleep = polls;
    expect(asleep).toBeGreaterThan(beforeSleep);   // it polled its way there
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
    expect(polls).toBe(asleep);                    // and then stopped
  });

  it("catches up the moment someone looks at it again", async () => {
    renderHook(() => useRideOffers(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => setVisibility("hidden"));
    await act(async () => { await vi.advanceTimersByTimeAsync(400_000); });
    const asleep = polls;

    act(() => setVisibility("visible"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(polls).toBeGreaterThan(asleep);
  });
});
