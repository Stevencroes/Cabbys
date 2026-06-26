import React, { createContext, useContext, useReducer } from "react";

export const STEP_NAMES = [
  "Occasion",
  "Route",
  "Schedule",
  "Party",
  "Vehicle",
  "Fare",
  "Account",
  "Payment",
] as const;

export interface BookingState {
  journey: string | null;
  from: string;
  to: string;
  fromCustom: string;
  toCustom: string;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  vehicle: string | null;
  currency: "AWG" | "USD" | "EUR";
  step: number;
  open: boolean;
  signedIn: boolean;
}

type StateKey = keyof BookingState;
type StateValue<K extends StateKey> = BookingState[K];

const initialState: BookingState = {
  journey: null,
  from: "",
  to: "",
  fromCustom: "",
  toCustom: "",
  date: "",
  time: "",
  passengers: 2,
  luggage: 2,
  vehicle: null,
  currency: "AWG",
  step: 0,
  open: false,
  signedIn: false,
};

type Action =
  | { type: "OPEN"; journeyKey?: string }
  | { type: "CLOSE" }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "GO_TO"; step: number }
  | { type: "RESET" }
  | { type: "SET_FIELD"; key: StateKey; value: BookingState[StateKey] };

function reducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        open: true,
        step: 0,
        journey: action.journeyKey ?? null,
      };
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
      return { ...state, [action.key]: action.value };
    default:
      return state;
  }
}

function computeCanContinue(state: BookingState): boolean {
  switch (state.step) {
    case 0:
      return !!state.journey;
    case 1:
      return !!state.from && !!state.to;
    case 2:
      return !!state.date && !!state.time;
    case 3:
      return state.passengers >= 1;
    case 4:
      return !!state.vehicle;
    case 5:
      return true;
    case 6:
      return state.signedIn;
    case 7:
      return true;
    default:
      return true;
  }
}

interface BookingContextValue {
  state: BookingState;
  canContinue: boolean;
  STEP_NAMES: typeof STEP_NAMES;
  open: (journeyKey?: string) => void;
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

  const value: BookingContextValue = {
    state,
    canContinue,
    STEP_NAMES,
    open: (journeyKey?: string) => dispatch({ type: "OPEN", journeyKey }),
    close: () => dispatch({ type: "CLOSE" }),
    next: () => dispatch({ type: "NEXT" }),
    back: () => dispatch({ type: "BACK" }),
    goTo: (step: number) => dispatch({ type: "GO_TO", step }),
    reset: () => dispatch({ type: "RESET" }),
    setField: <K extends StateKey>(key: K, value: StateValue<K>) =>
      dispatch({ type: "SET_FIELD", key, value: value as BookingState[StateKey] }),
  };

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
