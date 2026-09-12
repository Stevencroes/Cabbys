import { describe, it, expect, vi, beforeEach } from "vitest";

let rpcResult: unknown = { ok: true };
let rpcError: { message: string } | null = null;
const calls: [string, Record<string, unknown>][] = [];

vi.mock("./supabase", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      return Promise.resolve({ data: rpcResult, error: rpcError });
    },
  },
}));

import { setPickupPin, pinWorthAsking, pinWorthPrompting, locateMe, LOCATE_MESSAGES } from "./pickupPin";

beforeEach(() => { rpcResult = { ok: true }; rpcError = null; calls.length = 0; });

describe("when a pin is worth asking for", () => {
  // A pin at the airport tells the driver what the flight number already
  // told them, and it is being asked of somebody who has not landed yet.
  it("never asks at the airport", () => {
    expect(pinWorthAsking("Queen Beatrix International Airport")).toBe(false);
    expect(pinWorthPrompting("Queen Beatrix International Airport")).toBe(false);
  });

  // A resort in the catalog is somewhere this app can already place. The
  // offer stands — which entrance is real — but it is not urged.
  it("offers at a known resort without making a thing of it", () => {
    expect(pinWorthAsking("Bucuti & Tara Beach Resort")).toBe(true);
    expect(pinWorthPrompting("Bucuti & Tara Beach Resort")).toBe(false);
  });

  // A typed address is where it pays: this codebase already refuses to
  // price against Aruban street text (see fareName in lib/quote.ts), and
  // the driver currently gets a street name and a hope.
  it("urges it for an address nobody can place", () => {
    expect(pinWorthPrompting("Villa Sunrise 14, Palm Beach")).toBe(true);
  });

  it("asks for nothing when there is no pickup at all", () => {
    expect(pinWorthAsking("")).toBe(false);
    expect(pinWorthAsking("   ")).toBe(false);
  });
});

describe("saving a pin", () => {
  it("sends the pin and the note through the one write path", async () => {
    expect(await setPickupPin("r1", { lat: 12.55, lng: -70.05 }, " blue gate ")).toEqual({ ok: true });
    expect(calls).toEqual([["set_pickup_pin", {
      p_ride_id: "r1", p_lat: 12.55, p_lng: -70.05, p_note: " blue gate ",
    }]]);
  });

  it("sends a note with no coordinates, for a guest who isn't there yet", async () => {
    await setPickupPin("r1", null, "blue gate");
    expect(calls[0][1]).toMatchObject({ p_lat: null, p_lng: null });
  });

  // A phone answering with the wifi's idea of where it is, or a stale fix
  // from the airport they flew out of, is worse than no pin — the driver's
  // map would believe it.
  it("turns the database's refusal into something a guest can act on", async () => {
    rpcResult = { ok: false, error: "off_island" };
    const res = await setPickupPin("r1", { lat: 52.37, lng: 4.9 }, "");
    expect(res).toEqual({ ok: false, detail: expect.stringMatching(/isn't in Aruba/i) });
  });

  it("does not call a failed write a success", async () => {
    rpcError = { message: "network" };
    expect(await setPickupPin("r1", null, "x")).toEqual({ ok: false, detail: "network" });
  });
});

describe("asking the phone where it is", () => {
  it("says so plainly when the browser has no geolocation at all", async () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    expect(await locateMe()).toEqual({ ok: false, why: "unsupported" });
    Object.defineProperty(globalThis, "navigator", { value: original, configurable: true });
  });

  // A blocked permission is not a dead end: the note does the same job.
  it("names every failure, and every message offers the note instead", () => {
    for (const msg of Object.values(LOCATE_MESSAGES)) {
      expect(msg.toLowerCase()).toMatch(/describ/);
    }
  });

  it("hands back the fix when the phone answers", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        geolocation: {
          getCurrentPosition: (ok: (p: unknown) => void) =>
            ok({ coords: { latitude: 12.55, longitude: -70.05, accuracy: 12 } }),
        },
      },
      configurable: true,
    });
    expect(await locateMe()).toEqual({ ok: true, lat: 12.55, lng: -70.05, accuracy: 12 });
  });
});
