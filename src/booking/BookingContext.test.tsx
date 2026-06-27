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

  it("gates Ride on vehicle + signedIn", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => {
      result.current.open();
      result.current.goTo(1);
    });
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("vehicle", "sedan"));
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("signedIn", true));
    expect(result.current.canContinue).toBe(true);
  });
});
