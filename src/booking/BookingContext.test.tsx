import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "./BookingContext";
import { placeById, selFromPlace, AIRPORT } from "../data/places";

const wrapper = ({ children }: { children: React.ReactNode }) => <BookingProvider>{children}</BookingProvider>;
const ritz = () => selFromPlace(placeById("ritz")!);

describe("BookingContext v3", () => {
  it("has two steps: the ride, then you", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    expect(result.current.STEP_NAMES).toEqual(["The ride", "Your details"]);
    act(() => result.current.open());
    expect(result.current.state.step).toBe(1);
    act(() => result.current.goTo(2));
    expect(result.current.state.step).toBe(2);
  });

  it("open() carries a prefill — nothing is asked twice", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => result.current.open({ from: selFromPlace(AIRPORT), to: ritz(), pax: 4 }));
    expect(result.current.state.from?.id).toBe("airport");
    expect(result.current.state.to?.id).toBe("ritz");
    expect(result.current.state.pax).toBe(4);
    // §3.4 — bags default to min(guests, 2) so the modal auto-selects the
    // same vehicle the hero card showed
    expect(result.current.state.bags).toBe(2);
  });

  it("swap exchanges pickup and drop-off", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => result.current.open({ from: selFromPlace(AIRPORT), to: ritz() }));
    act(() => result.current.swap());
    expect(result.current.state.from?.id).toBe("ritz");
    expect(result.current.state.to?.id).toBe("airport");
  });

  it("planning-from-abroad default: pickup prefills to the airport", () => {
    // vitest env is not America/Aruba, so the timezone hint says "abroad"
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => result.current.open());
    expect(result.current.state.from?.id).toBe("airport");
  });

  it("'Bring us back' opens real fields on the state", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => {
      result.current.open();
      result.current.setField("journey", "return");
      result.current.setField("returnDate", "2026-08-02");
      result.current.setField("returnTime", "14:00");
    });
    expect(result.current.state.journey).toBe("return");
    expect(result.current.state.returnDate).toBe("2026-08-02");
  });
});
