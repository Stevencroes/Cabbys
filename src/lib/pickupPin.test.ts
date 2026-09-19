import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("./supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  ARUBA_BOX, inAruba, pickupInstant, pinPolicyFor, pinWindowOpen, savePickupPin,
  PIN_OPENS_MINUTES, PIN_CLOSES_MINUTES,
} from "./pickupPin";

beforeEach(() => { rpc.mockReset(); });

describe("which pickups may be pinned", () => {
  it("never asks at the airport", () => {
    expect(pinPolicyFor("Queen Beatrix International Airport")).toBe("airport");
  });

  it("asks a resort which entrance, not where it is", () => {
    expect(pinPolicyFor("Eagle Aruba Resort")).toBe("place");
  });

  it("asks for a coordinate only where the name doesn't carry one", () => {
    expect(pinPolicyFor("Kamay 14-B, Noord")).toBe("address");
    expect(pinPolicyFor("")).toBe("address");
  });
});

describe("the island box", () => {
  it("takes a point on Aruba", () => {
    expect(inAruba(12.5014, -70.0152)).toBe(true);   // the airport
    expect(inAruba(12.5772, -70.0522)).toBe(true);   // Eagle Beach
  });

  // The failure this feature has to survive: a pin tapped from the plane,
  // from home, or from the last island. A wrong coordinate outranks the
  // resort name it overrides, because the driver's map calls it "Guest
  // pinned" and zooms to door level on it.
  it("refuses the places a guest taps by mistake", () => {
    expect(inAruba(40.6895, -74.1745)).toBe(false);  // Newark
    expect(inAruba(12.1084, -68.9335)).toBe(false);  // Curaçao
    expect(inAruba(11.9700, -69.9500)).toBe(false);  // the Venezuelan coast
    expect(inAruba(52.3105, 4.7683)).toBe(false);    // Schiphol
  });

  it("keeps a margin of water around the island", () => {
    expect(ARUBA_BOX.minLat).toBeLessThan(12.398);
    expect(ARUBA_BOX.maxLat).toBeGreaterThan(12.628);
  });
});

describe("when the spot is worth asking for", () => {
  const at = Date.parse("2026-09-20T18:00:00.000Z");

  it("opens a few hours out and closes after the pickup", () => {
    expect(pinWindowOpen("2026-09-20T18:00:00.000Z", at - (PIN_OPENS_MINUTES - 5) * 60_000)).toBe(true);
    expect(pinWindowOpen("2026-09-20T18:00:00.000Z", at)).toBe(true);
    expect(pinWindowOpen("2026-09-20T18:00:00.000Z", at + (PIN_CLOSES_MINUTES - 5) * 60_000)).toBe(true);
  });

  // The whole argument for the window: a coordinate captured three weeks
  // early is not a worse pin, it is a wrong one.
  it("stays shut the week before and the day after", () => {
    expect(pinWindowOpen("2026-09-20T18:00:00.000Z", at - 7 * 24 * 60 * 60_000)).toBe(false);
    expect(pinWindowOpen("2026-09-20T18:00:00.000Z", at + 24 * 60 * 60_000)).toBe(false);
  });

  it("stays shut on a ride with no time on it", () => {
    expect(pinWindowOpen(undefined, at)).toBe(false);
    expect(pinWindowOpen("not a date", at)).toBe(false);
  });
});

describe("saving", () => {
  it("refuses a point off the island without a round trip", async () => {
    const res = await savePickupPin("r1", { lat: 40.6895, lng: -74.1745 });
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    if (!res.ok) expect(res.detail).toMatch(/isn't in Aruba/i);
  });

  it("sends the note on its own, and says so in the guest's words", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await savePickupPin("r1", { note: "Blue gate" });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_pickup_pin", {
      p_ride_id: "r1", p_lat: null, p_lng: null, p_note: "Blue gate",
    });
  });

  // Never a code on screen. The database says 'already_cancelled'; the
  // guest reads why there is nobody to send it to.
  it("turns the database's refusal into a sentence", async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: "already_cancelled" }, error: null });
    const res = await savePickupPin("r1", { note: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.detail).toMatch(/cancelled/i);
      expect(res.detail).not.toMatch(/already_cancelled/);
    }
  });

  it("keeps the database's own words when it has none of its own", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied for table rides" } });
    const res = await savePickupPin("r1", { note: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.detail).toBe("permission denied for table rides");
  });
});

// ── the two shapes a ride's time comes in ────────────────────────────
//
// This is the fault that made the whole feature invisible. The booking
// flow writes scheduled_date + scheduled_time and leaves scheduled_at
// null; the component read scheduled_at alone, got undefined, and
// pinWindowOpen correctly refused a time that was not there. So the
// window was never open — for anyone, at any hour — while every unit
// test passed, because the tests handed it a scheduled_at that no real
// row has.
describe("finding out when the pickup actually is", () => {
  it("reads the date and time pair the booking flow writes", () => {
    expect(pickupInstant({ scheduled_date: "2026-09-20", scheduled_time: "14:00" }))
      .toBe("2026-09-20T18:00:00.000Z");   // 2pm in Aruba is 18:00Z
  });

  it("anchors to the island, not to the phone reading it", () => {
    // The same booking, resolved from a browser in Amsterdam or in Los
    // Angeles, has to be the same instant — otherwise the three-hour
    // window opens six hours out for exactly the guest it is for.
    const at = pickupInstant({ scheduled_date: "2026-09-20", scheduled_time: "05:30" });
    expect(at).toBe("2026-09-20T09:30:00.000Z");
  });

  it("still takes a scheduled_at when that is what the row has", () => {
    expect(pickupInstant({ scheduled_at: "2026-09-20T18:00:00.000Z" }))
      .toBe("2026-09-20T18:00:00.000Z");
  });

  it("prefers the pair, the way every SQL path in the repo does", () => {
    expect(pickupInstant({
      scheduled_date: "2026-09-20", scheduled_time: "14:00",
      scheduled_at: "2030-01-01T00:00:00.000Z",
    })).toBe("2026-09-20T18:00:00.000Z");
  });

  it("has no opinion when the row carries no time", () => {
    expect(pickupInstant({})).toBe(null);
    expect(pinWindowOpen(pickupInstant({}))).toBe(false);
  });

  // A bad date must not take the trip card down with it. arubaInstant
  // would hand toISOString an Invalid Date and throw.
  it("falls through a malformed date instead of throwing", () => {
    expect(() => pickupInstant({ scheduled_date: "soon" })).not.toThrow();
    expect(pickupInstant({ scheduled_date: "soon" })).toBe(null);
    expect(pickupInstant({ scheduled_date: "soon", scheduled_at: "2026-09-20T18:00:00.000Z" }))
      .toBe("2026-09-20T18:00:00.000Z");
  });

  it("opens the window off the pair, which is the whole point", () => {
    const pickup = Date.parse("2026-09-20T18:00:00.000Z");
    const row = { scheduled_date: "2026-09-20", scheduled_time: "14:00" };
    expect(pinWindowOpen(pickupInstant(row), pickup - 30 * 60_000)).toBe(true);
    expect(pinWindowOpen(pickupInstant(row), pickup - 5 * 60 * 60_000)).toBe(false);
  });
});
