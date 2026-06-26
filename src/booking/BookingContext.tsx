import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";

export const STEP_NAMES = ["Trip", "Ride", "Confirm"] as const;

export interface BookingState {
  from: string;
  to: string;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  vehicle: string | null;
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
  step: 0,
  open: false,
  signedIn: false,
};

type Action =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GO_TO"; step: number }
  | { type: "RESET" }
  | { type: "SET_FIELD"; key: StateKey; value: BookingState[StateKey] };

function reducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case "OPEN":
      return { ...state, open: true, step: 0 };
    case "CLOSE":
      return { ...state, open: false };
    case "NEXT":
      if (!computeCanContinue(state)) return state;
      return { ...state, step: state.step + 1 };
    case "BACK":
      return { ...state, step: Math.max(0, state.step - 1) };
    case "GO_TO":
      return { ...state, step: action.step };
    case "RESET":
      return { ...initialState };
    case "SET_FIELD":
      if (state[action.key] === action.value) return state;
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

function computeCanContinue(state: BookingState): boolean {
  switch (state.step) {
    case 0: // Trip
      return !!state.from && !!state.to && !!state.date && !!state.time && state.passengers >= 1;
    case 1: // Ride
      return !!state.vehicle;
    case 2: // Confirm
      return state.signedIn;
    default:
      return true;
  }
}

interface BookingContextValue {
  state: BookingState;
  canContinue: boolean;
  STEP_NAMES: typeof STEP_NAMES;
  open: () => void;
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

  const open = useCallback(() => dispatch({ type: "OPEN" }), []);
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
