import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "./BookingContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <BookingProvider>{children}</BookingProvider>;

describe("BookingContext", () => {
  it("gates Trip until from+to+when+passengers are set", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => result.current.open());
    expect(result.current.state.open).toBe(true);
    expect(result.current.canContinue).toBe(false);
    act(() => {
      result.current.setField("from", "Airport");
      result.current.setField("to", "Palm Beach");
      result.current.setField("date", "2026-07-01");
      result.current.setField("time", "14:00");
    });
    expect(result.current.canContinue).toBe(true);
  });

  it("gates Ride on vehicle only — no sign-in wall", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => {
      result.current.open();
      result.current.goTo(1);
    });
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("vehicle", "sedan"));
    expect(result.current.canContinue).toBe(true);
  });

  it("gates Details on lead passenger name + reachable phone", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => {
      result.current.open();
      result.current.goTo(2);
    });
    expect(result.current.canContinue).toBe(false);
    act(() => {
      result.current.setField("contactName", "Ada Lovelace");
      result.current.setField("contactPhone", "+1 (555) 123-4567");
    });
    expect(result.current.canContinue).toBe(true);
    // A malformed optional email blocks; clearing it unblocks.
    act(() => result.current.setField("contactEmail", "not-an-email"));
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("contactEmail", "ada@example.com"));
    expect(result.current.canContinue).toBe(true);
    // Same for an optional flight number.
    act(() => result.current.setField("flightNumber", "12345678"));
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("flightNumber", "AA 1234"));
    expect(result.current.canContinue).toBe(true);
  });

  it("exposes the four funnel steps", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    expect(result.current.STEP_NAMES).toEqual(["Where to", "Ride", "Details", "Pay"]);
  });
});
