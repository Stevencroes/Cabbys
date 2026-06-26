import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { BookingProvider, useBooking } from "./BookingContext";
import { clearPricingCache } from "../lib/pricing";

vi.mock("../lib/supabase", () => {
  const data: Record<string, unknown[]> = {
    pricing_zones: [{ zone_code: "A", island: "aruba", active: true }],
    pricing_locations: [
      { name: "Queen Beatrix International Airport", zone_code: "AIRPORT", island: "aruba", active: true },
      { name: "Palm Beach", zone_code: "A", island: "aruba", active: true },
    ],
    pricing_routes: [
      { from_name: "Airport", to_name: "Palm Beach", price: 40, bidirectional: true, island: "aruba", active: true },
    ],
    pricing_addons: [
      { key: "late_night", label: "Late-night", kind: "percent", amount: 15, sort: 1, island: "aruba", active: true },
    ],
    pricing_config: [
      { key: "min_fare", value: 12, island: "aruba" },
      { key: "late_night_start", value: 23, island: "aruba" },
      { key: "late_night_end", value: 5, island: "aruba" },
    ],
  };
  const builder = (table: string) => {
    const rows = data[table] ?? [];
    const b: Record<string, unknown> = {
      _rows: rows,
      select() { return b; },
      eq() { return b; },
      order() { return b; },
      then(res: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    };
    return b;
  };
  return { supabase: { from: builder } };
});

// useFare is not yet implemented — this import will fail until Task 2
import { useFare } from "./useFare";

// Helper: render useFare inside a BookingProvider whose state has been
// pre-seeded via setField calls.
function renderUseFare(opts: {
  from: string;
  to: string;
  date: string;
  time: string;
  vehicle: string;
  luggage?: number;
  passengers?: number;
}) {
  function useSetupAndFare() {
    const { setField } = useBooking();
    React.useEffect(() => {
      setField("from", opts.from);
      setField("to", opts.to);
      setField("date", opts.date);
      setField("time", opts.time);
      setField("vehicle", opts.vehicle);
      if (opts.luggage !== undefined) setField("luggage", opts.luggage);
      if (opts.passengers !== undefined) setField("passengers", opts.passengers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return useFare();
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BookingProvider>{children}</BookingProvider>
  );
  return renderHook(() => useSetupAndFare(), { wrapper: Wrapper });
}

describe("useFare", () => {
  beforeEach(() => { clearPricingCache(); });

  it("starts in loading state then settles", async () => {
    const { result } = renderUseFare({
      from: "Queen Beatrix International Airport",
      to: "Palm Beach",
      date: "2026-06-26",
      time: "14:00",
      vehicle: "sedan",
    });
    // Synchronously true before pricing resolves
    expect(result.current.loading).toBe(true);
    // Drain the pending async state update so no act() warning leaks
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("computes total ≈ 42.4 for Airport→Palm Beach, sedan, daytime", async () => {
    const { result } = renderUseFare({
      from: "Queen Beatrix International Airport",
      to: "Palm Beach",
      date: "2026-06-26",
      time: "14:00",
      vehicle: "sedan",
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Airport→Palm Beach = 40 AWG, sedan mult=1.0, tax=6% → 42.4
    expect(result.current.total).toBeCloseTo(42.4, 1);
    expect(result.current.tax).toBeCloseTo(2.4, 1);
    expect(result.current.base).toBeCloseTo(40, 1);
  });

  it("scales with vehicle multiplier (van mult=2.05)", async () => {
    const { result } = renderUseFare({
      from: "Queen Beatrix International Airport",
      to: "Palm Beach",
      date: "2026-06-26",
      time: "14:00",
      vehicle: "van",
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 40 * 2.05 = 82, tax = 4.92, total = 86.92
    expect(result.current.base).toBeCloseTo(82, 1);
    expect(result.current.total).toBeCloseTo(86.92, 1);
  });
});
