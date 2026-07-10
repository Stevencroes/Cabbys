import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../lib/supabase", () => {
  const data = {
    pricing_zones: [{ zone_code: "A", island: "aruba", active: true }],
    pricing_locations: [
      { name: "Queen Beatrix International Airport", zone_code: "AIRPORT" },
      { name: "Palm Beach", zone_code: "A" },
    ],
    pricing_routes: [
      { from_name: "Airport", to_name: "Palm Beach", price: 40, bidirectional: true },
    ],
    pricing_addons: [
      { key: "late_night", label: "Late-night", kind: "percent", amount: 15, sort: 1 },
      { key: "luxury", label: "Luxury", kind: "percent", amount: 40, sort: 2 },
    ],
    pricing_config: [
      { key: "min_fare", value: 12 }, { key: "late_night_start", value: 23 }, { key: "late_night_end", value: 5 },
    ],
  };
  const builder = (table: string) => {
    const rows = (data as any)[table] || [];
    const b: any = {
      select() { return b; }, eq() { return b; }, order() { return b; },
      then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); },
    };
    return b;
  };
  return {
    supabase: {
      from: builder,
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepRide from "./StepRide";

function Setup({ pax = 2, bags = 2 }: { pax?: number; bags?: number }) {
  const { setField } = useBooking();
  return (
    <button
      onClick={() => {
        setField("from", "Queen Beatrix International Airport");
        setField("to", "Palm Beach");
        setField("date", "2026-07-01");
        setField("time", "14:00");
        setField("passengers", pax);
        setField("luggage", bags);
      }}
    >
      seed
    </button>
  );
}

describe("StepRide", () => {
  it("shows USD fares for the vehicles", async () => {
    render(<BookingProvider><Setup /><StepRide /></BookingProvider>);
    fireEvent.click(screen.getByText("seed"));
    await waitFor(() => expect(screen.getAllByText(/\$\d/).length).toBeGreaterThan(0));
  });

  it("disables vehicles too small for the party", async () => {
    render(<BookingProvider><Setup pax={7} bags={8} /><StepRide /></BookingProvider>);
    fireEvent.click(screen.getByText("seed"));
    await waitFor(() => {
      const sedan = screen.getByRole("button", { name: /The Saloon/i });
      expect(sedan).toBeDisabled();
    });
  });
});
