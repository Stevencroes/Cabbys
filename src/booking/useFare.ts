import { useState, useEffect } from "react";
import { loadPricing, computeFare, addTax, Pricing, FareResult, LineItem } from "../lib/pricing";
import { useBooking, BookingState } from "./BookingContext";
import { VEHICLES, Vehicle } from "../data/vehicles";

export interface FareState {
  loading: boolean;
  fare: FareResult;
  base: number;
  tax: number;
  total: number;
  lineItems: LineItem[];
}

const EMPTY_FARE: FareResult = {
  base: 0,
  total: 0,
  lineItems: [],
  source: "min",
};

function buildWhen(date: string, time: string): Date {
  if (date && time) {
    const d = new Date(`${date}T${time}:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function fareForVehicle(pricing: Pricing, state: BookingState, vehicle: Vehicle): number {
  const engine = computeFare(pricing, {
    pickup: state.from || undefined,
    dropoff: state.to || undefined,
    when: buildWhen(state.date, state.time),
    luxury: false,
  });
  const base = engine.total * vehicle.mult;
  const { total } = addTax(base);
  return total;
}

export function useFare(): FareState {
  const { state } = useBooking();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((p) => {
      if (!cancelled) {
        setPricing(p);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (!pricing || loading) {
    return { loading: true, fare: EMPTY_FARE, base: 0, tax: 0, total: 0, lineItems: [] };
  }

  const selectedVehicle = VEHICLES.find((v) => v.id === state.vehicle);
  const vehicleMult = selectedVehicle?.mult ?? 1;

  const engine = computeFare(pricing, {
    pickup: state.from || undefined,
    dropoff: state.to || undefined,
    when: buildWhen(state.date, state.time),
    luxury: false,
  });

  const base = engine.total * vehicleMult;
  const { tax, total } = addTax(base);

  return {
    loading: false,
    fare: engine,
    base,
    tax,
    total,
    lineItems: engine.lineItems,
  };
}
