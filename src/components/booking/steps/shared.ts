// What the steps agree on: how a blocked step reports itself, and the one
// pickup moment every step has to agree about.
import type { BookingState } from "../../../booking/BookingContext";
import { driverWaitsFrom, collectAt, collectDate } from "../../../lib/derivedTime";
import { legDuration } from "../../../lib/quote";
import { AIRPORT_ID } from "../../../data/places";

export interface StepProblem {
  /** which control the message belongs under */
  field: string;
  message: string;
  focus?: () => void;
}

/** The drive to the airport, which a flight-home pickup works back from
    as well as the airport lead. The same estimate the flow shows beside
    the price (legDuration). */
export function driveToAirport(state: BookingState): number {
  return state.from && state.to ? legDuration(state.from, state.to) : 0;
}

/** §3.6 — the moment the car is actually there. An airport end derives it
    from the flight; anywhere else it is what the traveller asked for. */
export function effectivePickupTime(state: BookingState): string {
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  if (fromAirport && state.flightLanding) return driverWaitsFrom(state.flightLanding);
  if (toAirport && state.depTime) return collectAt(state.depTime, state.destUS, driveToAirport(state));
  return state.pickupTime;
}

/** The day of that moment. state.date is the FLIGHT's date for a ride to
    the airport, and an early-morning take-off is collected the evening
    before — see collectDate. Everything that stores or shows the pickup
    reads this, never state.date beside effectivePickupTime. */
export function effectivePickupDate(state: BookingState): string {
  if (state.to?.id === AIRPORT_ID && state.from?.id !== AIRPORT_ID && state.depTime) {
    return collectDate(state.date, state.depTime, state.destUS, driveToAirport(state));
  }
  return state.date;
}
