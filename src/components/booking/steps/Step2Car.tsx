// Step 1 — YOUR CAR. The trip as an editable band, then party, child seats
// and the fleet, with every fare already carrying the route it was quoted for.
//
// The route used to have a step to itself. The hero card asks for it before
// the flow ever opens, so that step was a second asking; it is now the
// summary at the top of this one, which is also where someone arriving with
// no route at all types theirs.
import { useEffect, useRef } from "react";
import { useBooking } from "../../../booking/BookingContext";
import Stepper from "../../Stepper";
import LiveMap from "../LiveMap";
import VehiclePhoto from "../VehiclePhoto";
import { MAX_BAGS, MAX_PAX, VEHICLES, fitsParty } from "../../../data/vehicles";
import { quote, usd } from "../../../lib/quote";
import type { Pricing } from "../../../lib/pricing";
import { AIRPORT_ID } from "../../../data/places";
import { effectivePickupTime, type StepProblem } from "./shared";
import TripSummary, { validateTrip } from "../TripSummary";

/** The rail map's height, mirrored by .pcol-rail .tripmap .lmap in
    globals.css — change both. */
const MAP_H = 340;

interface Step2Props {
  pricing: Pricing | null;
  problem: StepProblem | null;
  registerValidator: (fn: () => StepProblem | null) => void;
  /** the total + primary action, rendered flat under the map rail */
  foot: React.ReactNode;
}

export default function Step2Car({ pricing, problem, registerValidator, foot }: Step2Props) {
  const { state, setField } = useBooking();
  const carsRef = useRef<HTMLDivElement>(null);
  const fromInput = useRef<HTMLInputElement | null>(null);
  const toInput = useRef<HTMLInputElement | null>(null);

  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  // The screen greets the trip it was handed. An arrival is not the same
  // errand as a departure, and neither is a run across the island.
  const heading = fromAirport
    ? { h: <>Landing in <em>Aruba?</em></>, sub: "Tell us the flight — we do the timing. Then pick your car." }
    : toAirport
    ? { h: <>Catching a <em>flight?</em></>, sub: "Tell us when it leaves — we work backwards. Then pick your car." }
    : { h: <>Who's coming, and in <em>what?</em></>, sub: "Every fare below is all in — the route already set it." };

  const time = effectivePickupTime(state);
  const selVehicle = VEHICLES.find((v) => v.id === state.vehicle) ?? VEHICLES[0];
  const routed = !!(state.from && state.to && state.from.id !== state.to.id);
  const selQuote = routed
    ? quote({ from: state.from!, to: state.to!, vehicle: selVehicle, isReturn: state.journey === "return", pricing, pickupTime: time })
    : null;

  // Party comes before cars; cars that don't fit render dashed and dead.
  const selectedFits = fitsParty(selVehicle, state.pax, state.bags);
  // if the current car stops fitting, hop to the smallest that does
  useEffect(() => {
    if (!selectedFits) {
      const fit = VEHICLES.find((v) => fitsParty(v, state.pax, state.bags));
      if (fit) setField("vehicle", fit.id);
    }
  }, [selectedFits, state.pax, state.bags, setField]);

  // Nothing here can be left blank — the steppers top out at what the
  // The party can never exceed what the largest vehicle carries, and an
  // unfittable car cannot be selected — so nothing about the CAR can block
  // here. The route and schedule can, though: they live in the summary at
  // the top of this step now, so their validator lives here too.
  const focusById = (id: string) => () => document.getElementById(id)?.focus();
  useEffect(() => registerValidator(() => validateTrip(state, {
    from: () => fromInput.current?.focus(),
    to: () => toInput.current?.focus(),
    byId: focusById,
  })), [registerValidator, state]);

  // cars — real radio group with roving tabindex
  function onCarsKeyDown(e: React.KeyboardEvent) {
    const fitting = VEHICLES.filter((v) => fitsParty(v, state.pax, state.bags));
    const idx = fitting.findIndex((v) => v.id === state.vehicle);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = fitting[(idx + 1) % fitting.length];
      if (next) { setField("vehicle", next.id); focusCar(next.id); }
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = fitting[(idx - 1 + fitting.length) % fitting.length];
      if (prev) { setField("vehicle", prev.id); focusCar(prev.id); }
    }
  }
  function focusCar(id: string) {
    carsRef.current?.querySelector<HTMLElement>(`[data-vid="${id}"]`)?.focus();
  }

  return (
    <div className="panel">
      <div className="phead">
        <h2>{heading.h}</h2>
        <p className="psub">{heading.sub}</p>
      </div>

      <TripSummary problem={problem} fromRef={fromInput} toRef={toInput} lateNight={!!selQuote?.lateNight} />

      <div className="pcols pcols-rail">
      <div className="pcol">
      <div className="steppers">
        <div className="stw">
          <label>Guests</label>
          <Stepper value={state.pax} min={1} max={MAX_PAX} onChange={(v) => setField("pax", v)} testId="b-pax" />
        </div>
        <div className="stw">
          <label>Bags</label>
          <Stepper value={state.bags} min={0} max={MAX_BAGS} onChange={(v) => setField("bags", v)} />
        </div>
        <div className="stw">
          <label>Child seats</label>
          <Stepper value={state.seats} min={0} max={4} onChange={(v) => setField("seats", v)} />
        </div>
      </div>

      {state.seats > 0 && (
        <div className="fld" style={{ marginTop: 16 }}>
          <label htmlFor="b-ages">Children's ages <span className="soft">— so we bring the right seats</span></label>
          <input id="b-ages" type="text" inputMode="text" placeholder="e.g. 2 and 5" value={state.seatAges} onChange={(e) => setField("seatAges", e.target.value)} />
        </div>
      )}

      <div className="subh">Your car</div>
      <div role="radiogroup" aria-label="Choose your car" ref={carsRef} onKeyDown={onCarsKeyDown}>
        {VEHICLES.map((v) => {
          const fits = fitsParty(v, state.pax, state.bags);
          const selected = state.vehicle === v.id;
          const q = routed
            ? quote({ from: state.from!, to: state.to!, vehicle: v, isReturn: state.journey === "return", pricing, pickupTime: time })
            : null;
          return (
            <button
              key={v.id}
              type="button"
              data-vid={v.id}
              role="radio"
              aria-checked={selected}
              aria-disabled={!fits}
              tabIndex={selected ? 0 : -1}
              className={`vopt${selected ? " sel" : ""}${!fits ? " unfit" : ""}`}
              onClick={() => fits && setField("vehicle", v.id)}
            >
              <span className="vd" aria-hidden="true" />
              <VehiclePhoto vehicle={v} />
              <span className="vmain">
                <span className="vn">{v.name}</span>
                {/* the class label lived here until the car had a photo; the
                    picture says "van" faster than the words did, and the line
                    now fits on a phone without wrapping */}
                <span className="vm">{v.desc}</span>
                <span className="vs">{fits ? `Up to ${v.pax} guests · ${v.bags} bags` : `Seats ${v.pax} · your party doesn't fit`}</span>
              </span>
              {/* return already doubled here — the price cannot move at review */}
              <span className="vp">{q ? usd(q.totalUsd) : "—"}</span>
            </button>
          );
        })}
      </div>
      </div>

      {/* The route stays on screen while the car is chosen — the fare in
          the foot is this map's fare, not an abstraction. */}
      <div className="pcol pcol-rail">
        <div className="tripmap">
          <LiveMap from={state.from} to={state.to} minutes={selQuote?.minutes ?? null} fallbackHeight={MAP_H} ends />
        </div>
        {foot}
      </div>
      </div>
    </div>
  );
}
