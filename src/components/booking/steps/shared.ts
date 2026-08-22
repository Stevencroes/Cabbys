// What the steps agree on: how a blocked step reports itself, and the one
// pickup moment every step has to agree about.
import type { BookingState } from "../../../booking/BookingContext";
import { driverWaitsFrom, collectAt } from "../../../lib/derivedTime";
import { AIRPORT_ID } from "../../../data/places";

export interface StepProblem {
  /** which control the message belongs under */
  field: string;
  message: string;
  focus?: () => void;
}

/** §3.6 — the moment the car is actually there. An airport end derives it
    from the flight; anywhere else it is what the traveller asked for. */
export function effectivePickupTime(state: BookingState): string {
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  if (fromAirport && state.flightLanding) return driverWaitsFrom(state.flightLanding);
  if (toAirport && state.depTime) return collectAt(state.depTime, state.destUS);
  return state.pickupTime;
}
