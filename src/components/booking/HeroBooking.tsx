import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useBooking } from "../../booking/BookingContext";
import { fareForVehicle } from "../../booking/useFare";
import { loadPricing, type Pricing } from "../../lib/pricing";
import { formatMoney } from "../../lib/currency";
import { findPlaceByName } from "../../data/places";
import { VEHICLES, fitsParty } from "../../data/vehicles";
import { useCountUp } from "../../hooks/useCountUp";
import { EASE_CALM } from "../../lib/motion";
import PlacePicker from "./PlacePicker";
import Stepper from "../Stepper";

type Slot = "to" | "from";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Lightweight, honestly-labelled travel-time estimate by zone (no live routing yet).
function estimateMinutes(from: string, to: string): number | null {
  if (!from || !to) return null;
  const isAirport = (s: string) => s.toLowerCase().includes("airport");
  const zoneOf = (s: string) => (isAirport(s) ? "AIRPORT" : findPlaceByName(s)?.zone ?? "A");
  const a = zoneOf(from);
  const b = zoneOf(to);
  if (a === "AIRPORT" || b === "AIRPORT") {
    const dest = a === "AIRPORT" ? b : a;
    return dest === "C" ? 45 : dest === "B" ? 25 : 22;
  }
  if (a === b) return 12;
  return 20;
}

export default function HeroBooking() {
  const prefersReduced = useReducedMotion();
  const { state, setField, open } = useBooking();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  // Exactly one search field is ever open, targeting the active slot.
  const [activeSlot, setActiveSlot] = useState<Slot | null>("from");
  const [focusSearch, setFocusSearch] = useState(false);

  // Keep date/time populated so the fare engine + gating have a time.
  useEffect(() => {
    if (mode === "now") {
      setField("date", todayISO());
      setField("time", nowHHMM());
    }
  }, [mode, setField]);

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((p) => !cancelled && setPricing(p));
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = !!state.from && !!state.to;

  // Auto-pick a sensible vehicle once both ends are set.
  useEffect(() => {
    if (!ready || state.vehicle) return;
    const fit =
      VEHICLES.find((v) => v.id === "premium" && fitsParty(v, state.passengers, state.luggage)) ??
      VEHICLES.find((v) => fitsParty(v, state.passengers, state.luggage));
    if (fit) setField("vehicle", fit.id);
  }, [ready, state.vehicle, state.passengers, state.luggage, setField]);

  const selected = VEHICLES.find((v) => v.id === state.vehicle) ?? null;
  const fares = useMemo(() => {
    if (!pricing) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const v of VEHICLES) out[v.id] = fareForVehicle(pricing, state, v);
    return out;
  }, [pricing, state]);

  const total = selected && fares[selected.id] != null ? fares[selected.id] : 0;
  const animatedTotal = useCountUp(total, ready, 650);
  const mins = estimateMinutes(state.from, state.to);

  function openSlot(slot: Slot) {
    setActiveSlot(slot);
    setFocusSearch(true);
  }

  function handlePick(name: string) {
    if (!activeSlot) return;
    const slot = activeSlot;
    setField(slot, name);
    const other: Slot = slot === "to" ? "from" : "to";
    // Advance to the other slot only if it's still empty; otherwise close the search.
    if (!state[other]) {
      setActiveSlot(other);
      setFocusSearch(true);
    } else {
      setActiveSlot(null);
      setFocusSearch(false);
    }
  }

  function handleConfirm() {
    if (!ready) return;
    if (!state.date || !state.time) {
      setField("date", todayISO());
      setField("time", nowHHMM());
    }
    open(1); // jump straight into the existing Ride / checkout + Stripe step
  }

  const fmt = (n: number) => formatMoney(n, "USD");

  const slots: { key: Slot; label: string; value: string; empty: string; marker: "diamond" | "ring" }[] = [
    { key: "from", label: "Pickup", value: state.from, empty: "Where from?", marker: "ring" },
    { key: "to", label: "Destination", value: state.to, empty: "Where to?", marker: "diamond" },
  ];

  return (
    <motion.div
      className="hbk"
      initial={prefersReduced ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE_CALM, delay: 0.35 }}
    >
      <div className="hbk-head">
        <span className="hbk-eyebrow">Plan your transfer</span>
        <span className="hbk-avail">
          <span className="hbk-pulse" />
          Drivers on the island
        </span>
      </div>

      {/* slot rows — the active row becomes the typeable field itself (no separate search bar) */}
      <div className="hbk-slots">
        {slots.map((s) => {
          const active = activeSlot === s.key;
          const marker = <span className={s.marker === "diamond" ? "rdiamond" : "ring"} aria-hidden="true" />;
          if (active) {
            return (
              <div key={s.key} className="hbk-slot active">
                {marker}
                <div className="hbk-slot-text">
                  <span className="s-lbl">{s.label}</span>
                  <PlacePicker
                    variant="inline"
                    id={`hero-${s.key}`}
                    ariaLabel={s.label}
                    autoFocus={focusSearch}
                    value={s.value}
                    onPick={handlePick}
                    placeholder={s.empty}
                  />
                </div>
              </div>
            );
          }
          return (
            <button
              key={s.key}
              type="button"
              className="hbk-slot"
              onClick={() => openSlot(s.key)}
              aria-label={`Edit ${s.label.toLowerCase()}`}
            >
              {marker}
              <span className="hbk-slot-text">
                <span className="s-lbl">{s.label}</span>
                <span className={`s-val${s.value ? "" : " empty"}`}>{s.value || s.empty}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* progressive disclosure — revealed once both ends are set */}
      <AnimatePresence initial={false}>
        {ready && (
          <motion.div
            className="hbk-more"
            key="more"
            initial={prefersReduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={prefersReduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_CALM }}
          >
            <div className="hbk-inner">
              {/* When */}
              <div className="hbk-row">
                <div className="hbk-seg" role="tablist" aria-label="When">
                  <button type="button" role="tab" aria-selected={mode === "now"} className={mode === "now" ? "on" : ""} onClick={() => setMode("now")}>Now</button>
                  <button type="button" role="tab" aria-selected={mode === "schedule"} className={mode === "schedule" ? "on" : ""} onClick={() => setMode("schedule")}>Schedule</button>
                </div>
              </div>
              {mode === "schedule" && (
                <div className="hbk-pair">
                  <input className="hbk-date" type="date" aria-label="Date" value={state.date} min={todayISO()} onChange={(e) => setField("date", e.target.value)} />
                  <input className="hbk-date" type="time" aria-label="Time" value={state.time} onChange={(e) => setField("time", e.target.value)} />
                </div>
              )}

              {/* Passengers */}
              <div className="hbk-counter">
                <div>
                  <div className="hbk-counter-t">Passengers</div>
                  <div className="hbk-counter-d">Plus {state.luggage} bag{state.luggage === 1 ? "" : "s"}</div>
                </div>
                <Stepper value={state.passengers} min={1} max={7} onChange={(v) => setField("passengers", v)} testId="hero-pax" />
              </div>

              {/* Vehicle class */}
              <div className="hbk-field">
                <span className="hbk-lbl sm">Vehicle class</span>
                <div className="hbk-veh">
                  {VEHICLES.map((v) => {
                    const fits = fitsParty(v, state.passengers, state.luggage);
                    const on = state.vehicle === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`hbk-vchip${on ? " on" : ""}`}
                        disabled={!fits}
                        aria-pressed={on}
                        onClick={() => fits && setField("vehicle", v.id)}
                      >
                        <span className="hbk-vname">{v.name.replace(/^The /, "")}</span>
                        <span className="hbk-vpax">{v.pax} pax</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live price preview — "Your transfer awaits" */}
              <div className="hbk-quote ready">
                <div className="hbk-quote-specs">
                  <div className="hbk-spec">
                    <span className="hbk-spec-k">Vehicle</span>
                    <span className="hbk-spec-v">{selected ? selected.name : "—"}</span>
                  </div>
                  <div className="hbk-spec">
                    <span className="hbk-spec-k">Capacity</span>
                    <span className="hbk-spec-v">{selected ? `${selected.pax} pax` : "—"}</span>
                  </div>
                  <div className="hbk-spec">
                    <span className="hbk-spec-k">Est. time</span>
                    <span className="hbk-spec-v">{mins ? `${mins} min` : "—"}</span>
                  </div>
                </div>
                <div className="hbk-quote-total">
                  <span className="hbk-quote-k">Total fare · incl. tax</span>
                  <span className="hbk-quote-amt">{fmt(animatedTotal)}</span>
                </div>
              </div>

              <button type="button" className="hbk-cta" onClick={handleConfirm} disabled={!ready}>
                Reserve <span className="arr">→</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
