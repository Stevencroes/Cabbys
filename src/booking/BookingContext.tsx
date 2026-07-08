import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { isValidPhone, isValidEmail } from "../lib/contact";
import { isValidFlightNumber } from "../lib/flight";

export const STEP_NAMES = ["Where to", "Ride", "Details", "Pay"] as const;

export interface BookingState {
  from: string;
  to: string;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  vehicle: string | null;
  // Lead passenger — guest checkout, no account required.
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  // Airport transfers — lets Cabby's meet the flight, not the clock.
  flightNumber: string;
  notes: string;
  step: number;
  open: boolean;
  signedIn: boolean;
}

type StateKey = keyof BookingState;
type StateValue<K extends StateKey> = BookingState[K];

const initialState: BookingState = {
  from: "",
  to: "",
  date: "",
  time: "",
  passengers: 2,
  luggage: 2,
  vehicle: null,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  flightNumber: "",
  notes: "",
  step: 0,
  open: false,
  signedIn: false,
};

type Action =
  | { type: "OPEN"; step?: number }
  | { type: "CLOSE" }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GO_TO"; step: number }
  | { type: "RESET" }
  | { type: "SET_FIELD"; key: StateKey; value: BookingState[StateKey] };

function reducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case "OPEN":
      return { ...state, open: true, step: action.step ?? 0 };
    case "CLOSE":
      return { ...state, open: false };
    case "NEXT":
      if (!computeCanContinue(state)) return state;
      return { ...state, step: Math.min(STEP_NAMES.length - 1, state.step + 1) };
    case "BACK":
      return { ...state, step: Math.max(0, state.step - 1) };
    case "GO_TO":
      return { ...state, step: action.step };
    case "RESET":
      // Preserve session flag — resetting a finished booking doesn't sign out.
      return { ...initialState, signedIn: state.signedIn };
    case "SET_FIELD":
      if (state[action.key] === action.value) return state;
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

function computeCanContinue(state: BookingState): boolean {
  switch (state.step) {
    case 0: // Where to
      return !!state.from && !!state.to && !!state.date && !!state.time && state.passengers >= 1;
    case 1: // Ride — guest checkout: choosing a car is all it takes to move on
      return !!state.vehicle;
    case 2: // Details — lead passenger we can actually reach on the day
      return (
        state.contactName.trim().length >= 2 &&
        isValidPhone(state.contactPhone) &&
        (!state.contactEmail || isValidEmail(state.contactEmail)) &&
        (!state.flightNumber || isValidFlightNumber(state.flightNumber))
      );
    case 3: // Pay — the review screen owns its own confirm button
      return true;
    default:
      return true;
  }
}

interface BookingContextValue {
  state: BookingState;
  canContinue: boolean;
  STEP_NAMES: typeof STEP_NAMES;
  open: (step?: number) => void;
  close: () => void;
  next: () => void;
  back: () => void;
  goTo: (step: number) => void;
  reset: () => void;
  setField: <K extends StateKey>(key: K, value: StateValue<K>) => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const canContinue = computeCanContinue(state);

  const open = useCallback((step?: number) => dispatch({ type: "OPEN", step }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);
  const goTo = useCallback((step: number) => dispatch({ type: "GO_TO", step }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const setField = useCallback(<K extends StateKey>(key: K, val: StateValue<K>) =>
    dispatch({ type: "SET_FIELD", key, value: val as BookingState[StateKey] }), []);

  const value = useMemo<BookingContextValue>(
    () => ({ state, canContinue, STEP_NAMES, open, close, setField, next, back, goTo, reset }),
    [state, canContinue, open, close, setField, next, back, goTo, reset],
  );

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  );
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    throw new Error("useBooking must be used within a BookingProvider");
  }
  return ctx;
}

/** Like useBooking, but returns null outside a provider (e.g. standalone pages). */
export function useBookingOptional(): BookingContextValue | null {
  return useContext(BookingContext);
}
