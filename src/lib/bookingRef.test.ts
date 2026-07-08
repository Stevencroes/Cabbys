import { describe, it, expect } from "vitest";
import { generateBookingRef, refFromRideId } from "./bookingRef";

describe("booking references", () => {
  it("generates phone-friendly CB- codes", () => {
    for (let i = 0; i < 50; i++) {
      const ref = generateBookingRef();
      expect(ref).toMatch(/^CB-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it("derives a stable fallback ref from a ride id", () => {
    const a = refFromRideId("9f3c2a1e-77aa-4bde-9c11-52e6d0aa91xx");
    expect(a).toMatch(/^CB-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(refFromRideId("9f3c2a1e-77aa-4bde-9c11-52e6d0aa91xx")).toBe(a);
  });
});
