export type BookingState = {
  journey: string | null;
  from: string; to: string;
  date: string; time: string;
  passengers: number; luggage: number;
  vehicle: string | null;
  fareBase: number; fareTotal: number;
  addonKeys: string[];
};

export function buildRidePayload(s: BookingState, userId: string) {
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
  return { core, withCoords };
}
