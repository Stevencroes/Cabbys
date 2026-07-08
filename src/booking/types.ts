export interface ConfirmedBooking {
  rideId: string;
  bookingRef: string | null;
  from: string;
  to: string;
  date: string;
  time: string;
  vehicle: string | null;
  total: number;
  /** True when the fare was authorized on a card; false = settle on the day. */
  paid: boolean;
  flightNumber?: string;
  contactName?: string;
}
