import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepVehicle from "./StepVehicle";

// Minimal pricing mock so loadPricing resolves quickly
vi.mock("../../../lib/supabase", () => {
  const data: Record<string, unknown[]> = {
    pricing_zones: [],
    pricing_locations: [
      { name: "Queen Beatrix International Airport", zone_code: "AIRPORT", island: "aruba", active: true },
      { name: "Palm Beach", zone_code: "A", island: "aruba", active: true },
    ],
    pricing_routes: [
      { from_name: "Airport", to_name: "Palm Beach", price: 40, bidirectional: true, island: "aruba", active: true },
    ],
    pricing_addons: [],
    pricing_config: [{ key: "min_fare", value: 12, island: "aruba" }],
  };
  const builder = (table: string) => {
    const rows = data[table] ?? [];
    const b: Record<string, unknown> = {
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

function Harness({ passengers, luggage }: { passengers: number; luggage: number }) {
  const { setField, open, goTo } = useBooking();
  React.useEffect(() => {
    open("airport");
    goTo(4);
    setField("from", "Queen Beatrix International Airport");
    setField("to", "Palm Beach");
    setField("date", "2026-06-26");
    setField("time", "14:00");
    setField("passengers", passengers);
    setField("luggage", luggage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <StepVehicle />;
}

describe("StepVehicle", () => {
  it("marks vehicles too small for the party as disabled", async () => {
    // passengers=5, luggage=5 → sedan(pax3,bags3) and premium(pax3,bags3) are too small
    // suv(pax6,bags5) fits, van(pax7,bags8) fits
    render(
      <BookingProvider>
        <Harness passengers={5} luggage={5} />
      </BookingProvider>
    );
    // Wait for pricing to load — multiple fares appear, use findAllByText
    await waitFor(() => {
      const fares = screen.queryAllByText(/ƒ\d/);
      expect(fares.length).toBeGreaterThan(0);
    });
    const disabledVehs = document.querySelectorAll(".veh.disabled");
    expect(disabledVehs.length).toBeGreaterThanOrEqual(1);
    // Disabled vehicle buttons should have the HTML disabled attribute
    const disabledButtons = Array.from(disabledVehs) as HTMLButtonElement[];
    disabledButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("shows 'Too small for your party' note for undersized vehicles", async () => {
    render(
      <BookingProvider>
        <Harness passengers={5} luggage={5} />
      </BookingProvider>
    );
    // Wait for pricing to settle before asserting UI state
    await waitFor(() => {
      const fares = screen.queryAllByText(/ƒ\d/);
      expect(fares.length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/too small for your party/i).length).toBeGreaterThanOrEqual(1);
  });

  it("vehicles that fit the party are not disabled", async () => {
    // passengers=1, luggage=1 → all vehicles fit
    render(
      <BookingProvider>
        <Harness passengers={1} luggage={1} />
      </BookingProvider>
    );
    // Wait for pricing to load and assert real fare appears (sedan: ƒ42.40)
    await screen.findByText("ƒ42.40");
    const disabledVehs = document.querySelectorAll(".veh.disabled");
    expect(disabledVehs.length).toBe(0);
  });

  it("shows real fare amounts once pricing loads (sedan ƒ42.40, van ƒ86.92)", async () => {
    render(
      <BookingProvider>
        <Harness passengers={1} luggage={1} />
      </BookingProvider>
    );
    // Airport→Palm Beach, sedan mult=1.0, 40*1.06=42.40 AWG
    await screen.findByText("ƒ42.40");
    // Van mult=2.05: 40*2.05=82, tax=4.92, total=86.92
    expect(screen.getByText("ƒ86.92")).toBeInTheDocument();
    // No stale "—" placeholders should remain
    await waitFor(() => {
      expect(screen.queryByText("—")).not.toBeInTheDocument();
    });
  });
});
