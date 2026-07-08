import { describe, it, expect } from "vitest";
import { buildRidePayload, type BookingState } from "./bookingPayload";

const base: BookingState = {
  journey: "airport", from: "Queen Beatrix International Airport", to: "Palm Beach",
  date: "2026-07-01", time: "14:30", passengers: 2, luggage: 2,
  vehicle: "sedan", fareBase: 40, fareTotal: 42.4, addonKeys: [],
};

describe("buildRidePayload", () => {
  it("builds core columns that exist on rides", () => {
    const { core } = buildRidePayload(base, "user-123");
    expect(core).toMatchObject({
      passenger_id: "user-123",
      pickup_location: "Queen Beatrix International Airport",
      dropoff_location: "Palm Beach",
      vehicle_type: "sedan", passengers_count: 2,
      price: 42.4, status: "pending",
    });
  });

  it("builds withCoords with canonical fare + scheduled_at", () => {
    const { withCoords } = buildRidePayload(base, "user-123");
    expect(withCoords).toMatchObject({
      vehicle_class: "sedan", fare_base: 40, fare_total: 42.4, is_asap: false,
    });
    expect(typeof withCoords.scheduled_at).toBe("string");
  });

  it("adds guest contact + flight columns on the full tier, richest first", () => {
    const { full, tiers } = buildRidePayload(
      {
        ...base,
        bookingRef: "CB-7KM4Q",
        contactName: "Ada Lovelace",
        contactPhone: "+15551234567",
        contactEmail: "ada@example.com",
        flightNumber: "AA1234",
        notes: "Child seat please",
      },
      null,
    );
    expect(full).toMatchObject({
      passenger_id: null,
      booking_ref: "CB-7KM4Q",
      contact_name: "Ada Lovelace",
      contact_phone: "+15551234567",
      contact_email: "ada@example.com",
      flight_number: "AA1234",
      notes: "Child seat please",
      luggage_count: 2,
    });
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toBe(full);
    // Fallback tiers keep the legacy shapes so older DBs still take bookings.
    expect(tiers[2]).not.toHaveProperty("booking_ref");
  });
});
