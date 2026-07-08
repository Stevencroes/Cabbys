export type BookingState = {
  journey?: string | null;
  from: string; to: string;
  date: string; time: string;
  passengers: number; luggage: number;
  vehicle: string | null;
  fareBase: number; fareTotal: number;
  addonKeys: string[];
  // Guest-checkout contact + airport details (all optional for compat)
  bookingRef?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  flightNumber?: string;
  notes?: string;
};

// The production `rides` table has evolved; not every deployment has every
// column. We build three payload tiers, richest first, and the caller inserts
// with progressive fallback so a booking never fails on a missing column.
export function buildRidePayload(s: BookingState, userId: string | null) {
  const scheduledAt = new Date(`${s.date}T${s.time || "00:00"}`).toISOString();
  const core = {
    passenger_id: userId,
    pickup_location: s.from,
    dropoff_location: s.to,
    scheduled_date: s.date,
    scheduled_time: s.time,
    vehicle_type: s.vehicle,
    passengers_count: s.passengers,
    price: s.fareTotal,
    addons: s.addonKeys,
    status: "pending",
  };
  const withCoords = {
    ...core,
    scheduled_at: scheduledAt,
    is_asap: false,
    vehicle_class: s.vehicle,
    fare_base: s.fareBase,
    fare_discount: 0,
    fare_total: s.fareTotal,
  };
  const full = {
    ...withCoords,
    booking_ref: s.bookingRef ?? null,
    contact_name: s.contactName || null,
    contact_phone: s.contactPhone || null,
    contact_email: s.contactEmail || null,
    flight_number: s.flightNumber || null,
    notes: s.notes || null,
    luggage_count: s.luggage,
  };
  return { full, withCoords, core, tiers: [full, withCoords, core] };
}
