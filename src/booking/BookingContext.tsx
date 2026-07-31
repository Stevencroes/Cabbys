import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { AIRPORT, selFromPlace, type PlaceSel } from "../data/places";
import { isOnIsland } from "../lib/geo";

// v3 booking — two steps, not four: the ride, then you.
export const STEP_NAMES = ["The ride", "Your details"] as const;

export interface BookingState {
  open: boolean;
  step: 1 | 2;
  // the ride — symmetric: airport arrival is just the case where pickup
  // happens to be the airport. No mode toggle.
  from: PlaceSel | null;
  to: PlaceSel | null;
  date: string;
  journey: "one" | "return";
  // §3.6 — derived timing. Which fields apply follows from the route.
  flightNumber: string;   // pickup = airport
  flightLanding: string;  // scheduled landing HH:MM
  depTime: string;        // drop-off = airport: departure HH:MM
  destUS: boolean;        // flying to the US? (island pre-clearance → 3 h)
  pickupTime: string;     // neither end is the airport
  // §3.7 — "Bring us back" opens real fields
  returnDate: string;
  returnTime: string;     // collect-us-at, or return flight departure
  returnDestUS: boolean;
  // party
  pax: number;
  bags: number;
  seats: number;          // child seats
  seatAges: string;       // revealed when seats > 0 (the FAQ's promise)
  vehicle: string;        // vehicle id
  // you
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

type StateKey = keyof BookingState;

const initialState: BookingState = {
  open: false,
  step: 1,
  from: null,
  to: null,
  date: new Date().toISOString().slice(0, 10),
  journey: "one",
  flightNumber: "",
  flightLanding: "",
  depTime: "",
  destUS: true,
  pickupTime: "",
  returnDate: "",
  returnTime: "",
  returnDestUS: true,
  pax: 2,
  bags: 2,
  seats: 0,
  seatAges: "",
  vehicle: "sedan",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
};

export type Prefill = Partial<Pick<BookingState, "from" | "to" | "date" | "pax" | "vehicle">>;

type Action =
  | { type: "OPEN"; prefill?: Prefill }
  | { type: "CLOSE" }
  | { type: "GO_TO"; step: 1 | 2 }
  | { type: "SWAP" }
  | { type: "RESET" }
  | { type: "SET_FIELD"; key: StateKey; value: BookingState[StateKey] };

function reducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case "OPEN": {
      const next = { ...state, ...action.prefill, open: true, step: 1 as const };
      // Planning from abroad? Pickup defaults to the airport (§3.8's
      // timezone hint) — on-island guests know where they are.
      if (!next.from && !isOnIsland()) next.from = selFromPlace(AIRPORT);
      // Same-vehicle guarantee between hero and modal (§3.4): default
      // bags from guests so auto-selection can't diverge.
      if (action.prefill?.pax !== undefined && state.bags === initialState.bags) {
        next.bags = Math.min(next.pax, 2);
      }
      return next;
    }
    case "CLOSE":
      return { ...state, open: false };
    case "GO_TO":
      return { ...state, step: action.step };
    case "SWAP":
      // exchanges pickup and drop-off, including custom addresses
      return { ...state, from: state.to, to: state.from };
    case "RESET":
      return { ...initialState, date: new Date().toISOString().slice(0, 10) };
    case "SET_FIELD":
      if (state[action.key] === action.value) return state;
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

interface BookingContextValue {
  state: BookingState;
  STEP_NAMES: typeof STEP_NAMES;
  open: (prefill?: Prefill) => void;
  close: () => void;
  goTo: (step: 1 | 2) => void;
  swap: () => void;
  reset: () => void;
  setField: <K extends StateKey>(key: K, value: BookingState[K]) => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const open = useCallback((prefill?: Prefill) => dispatch({ type: "OPEN", prefill }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const goTo = useCallback((step: 1 | 2) => dispatch({ type: "GO_TO", step }), []);
  const swap = useCallback(() => dispatch({ type: "SWAP" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const setField = useCallback(<K extends StateKey>(key: K, value: BookingState[K]) =>
    dispatch({ type: "SET_FIELD", key, value }), []);

  const value = useMemo<BookingContextValue>(
    () => ({ state, STEP_NAMES, open, close, goTo, swap, reset, setField }),
    [state, open, close, goTo, swap, reset, setField],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within a BookingProvider");
  return ctx;
}

/** Like useBooking, but null outside a provider (standalone pages/tests). */
export function useBookingOptional(): BookingContextValue | null {
  return useContext(BookingContext);
}
