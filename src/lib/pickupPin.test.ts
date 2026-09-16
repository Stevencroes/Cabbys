import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("./supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  ARUBA_BOX, inAruba, pinPolicyFor, pinWindowOpen, savePickupPin,
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
