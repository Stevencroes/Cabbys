import { describe, it, expect } from "vitest";
import { buildRidePayload, type RideDraft } from "./bookingPayload";

const base: RideDraft = {
  from: "Queen Beatrix International Airport", to: "The Ritz-Carlton Aruba",
  date: "2026-07-01", time: "14:35", passengers: 2, luggage: 2,
  vehicle: "sedan", fareBase: 75.18, fareTotal: 75.18, addonKeys: [],
};

describe("buildRidePayload", () => {
  it("builds core columns that exist on rides", () => {
    const { core } = buildRidePayload(base, "user-123");
    expect(core).toMatchObject({
      passenger_id: "user-123",
      pickup_location: "Queen Beatrix International Airport",
      dropoff_location: "The Ritz-Carlton Aruba",
      vehicle_type: "sedan", passengers_count: 2,
      price: 75.18, status: "pending",
    });
  });

  it("builds withCoords with canonical fare + scheduled_at", () => {
    const { withCoords } = buildRidePayload(base, "user-123");
    expect(withCoords).toMatchObject({
      vehicle_class: "sedan", fare_base: 75.18, fare_total: 75.18, is_asap: false,
    });
    expect(typeof withCoords.scheduled_at).toBe("string");
  });

  it("adds v3 fields on the full tier — child seats, return leg, contact", () => {
    const { full, tiers } = buildRidePayload(
      {
        ...base,
        bookingRef: "CB-7KM4Q",
        contactName: "Ada Lovelace",
        contactPhone: "+15551234567",
        contactEmail: "ada@example.com",
        flightNumber: "AA1234",
        notes: "Child seats: 2 (ages 2 and 5)",
        childSeats: 2,
        returnDate: "2026-07-08",
        returnTime: "11:00",
      },
      null,
    );
    expect(full).toMatchObject({
      passenger_id: null,
      booking_ref: "CB-7KM4Q",
      contact_name: "Ada Lovelace",
      flight_number: "AA1234",
      child_seats: 2,
      return_date: "2026-07-08",
      return_time: "11:00",
      luggage_count: 2,
    });
    expect(tiers).toHaveLength(3);
    expect(tiers[2]).not.toHaveProperty("child_seats");
  });
});
