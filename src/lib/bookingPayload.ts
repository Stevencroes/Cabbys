export type RideDraft = {
  from: string; to: string;
  date: string; time: string;          // effective (possibly derived) pickup time
  passengers: number; luggage: number;
  vehicle: string;
  fareBase: number; fareTotal: number; // AWG — the driver dashboard reads florin
  addonKeys: string[];
  bookingRef?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  flightNumber?: string;
  notes?: string;
  childSeats?: number;
  returnDate?: string;
  returnTime?: string;
};

// The production `rides` table has evolved; not every deployment has every
// column. Three payload tiers, richest first — the caller inserts with
// progressive fallback so a booking never fails on a missing column.
export function buildRidePayload(s: RideDraft, userId: string | null) {
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
    child_seats: s.childSeats ?? 0,
    return_date: s.returnDate || null,
    return_time: s.returnTime || null,
  };
  return { full, withCoords, core, tiers: [full, withCoords, core] };
}

// Back-compat alias for older imports/tests.
export type BookingState = RideDraft;
