import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "./BookingContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <BookingProvider>{children}</BookingProvider>;

describe("BookingContext", () => {
  it("opens on a journey and gates step 0 until a journey is chosen", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    expect(result.current.state.open).toBe(false);
    act(() => result.current.open());
    expect(result.current.state.open).toBe(true);
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("journey", "airport"));
    expect(result.current.canContinue).toBe(true);
  });
  it("requires both route ends before leaving step 1", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => { result.current.open("airport"); result.current.next(); });
    expect(result.current.state.step).toBe(1);
    expect(result.current.canContinue).toBe(false);
    act(() => { result.current.setField("from", "Airport"); result.current.setField("to", "Palm Beach"); });
    expect(result.current.canContinue).toBe(true);
  });
});
