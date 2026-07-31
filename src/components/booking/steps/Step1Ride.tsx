// Step 1 — THE RIDE. Route · when · journey · party · car.
// The form reshapes itself around the route (§3.6): flights are asked
// for, pickup times are derived, and nobody is asked for dispatch maths.
import { useEffect, useMemo, useRef } from "react";
import { useBooking } from "../../../booking/BookingContext";
import PlaceCombobox from "../PlaceCombobox";
import Stepper from "../../Stepper";
import { VEHICLES, fitsParty } from "../../../data/vehicles";
import { quote, usd } from "../../../lib/quote";
import type { Pricing } from "../../../lib/pricing";
import { driverWaitsFrom, collectAt, insideMinNotice } from "../../../lib/derivedTime";
import { AIRPORT_ID } from "../../../data/places";

export interface StepProblem {
  message: string;
  focus?: () => void;
}

interface Step1Props {
  pricing: Pricing | null;
  hint: string;
  registerValidator: (fn: () => StepProblem | null) => void;
}

export default function Step1Ride({ pricing, hint, registerValidator }: Step1Props) {
  const { state, setField, swap } = useBooking();
  const fromInput = useRef<HTMLInputElement | null>(null);
  const toInput = useRef<HTMLInputElement | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const landingRef = useRef<HTMLInputElement>(null);
  const depRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const carsRef = useRef<HTMLDivElement>(null);

  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;

  // §3.6 — the derived pickup moment
  const derived = fromAirport && state.flightLanding
    ? { at: driverWaitsFrom(state.flightLanding), kind: "arrive" as const }
    : toAirport && state.depTime
    ? { at: collectAt(state.depTime, state.destUS), kind: "depart" as const }
    : null;

  const effectiveTime = derived?.at ?? (fromAirport || toAirport ? "" : state.pickupTime);
  const shortNotice = insideMinNotice(state.date, effectiveTime || state.flightLanding || state.depTime);

  const heading = fromAirport
    ? { kick: "Step 01 · The ride", h: <>Landing in <em>Aruba?</em></>, sub: "Tell us the flight — we do the timing." }
    : toAirport
    ? { kick: "Step 01 · The ride", h: <>Catching a <em>flight?</em></>, sub: "Tell us when it leaves — we work backwards." }
    : { kick: "Step 01 · The ride", h: <>Where to, and <em>when?</em></>, sub: "Door to door, anywhere on the island." };

  // Party comes before cars; cars that don't fit render dashed and dead.
  const selVehicle = VEHICLES.find((v) => v.id === state.vehicle) ?? VEHICLES[0];
  const selectedFits = fitsParty(selVehicle, state.pax, state.bags);
  // if the current car stops fitting, hop to the smallest that does
  useEffect(() => {
    if (!selectedFits) {
      const fit = VEHICLES.find((v) => fitsParty(v, state.pax, state.bags));
      if (fit) setField("vehicle", fit.id);
    }
  }, [selectedFits, state.pax, state.bags, setField]);

  // §3.10-adjacent — the validator lives here, the Continue button in the
  // total bar. Never disabled: focus the gap and say why.
  const validate = useMemo(() => () => {
    if (!state.from) return { message: "Tell us where to pick you up first.", focus: () => fromInput.current?.focus() };
    if (!state.to) return { message: "And where you're headed.", focus: () => toInput.current?.focus() };
    if (state.from.id === state.to.id) return { message: "Pickup and drop-off are the same place — change one.", focus: () => toInput.current?.focus() };
    if (!state.date) return { message: "Which day is this for?", focus: () => dateRef.current?.focus() };
    if (fromAirport && !state.flightLanding) return { message: "When does your flight land? We take it from there.", focus: () => landingRef.current?.focus() };
    if (toAirport && !state.depTime) return { message: "When does your flight leave? We work backwards from it.", focus: () => depRef.current?.focus() };
    if (!fromAirport && !toAirport && !state.pickupTime) return { message: "What time should the car be there?", focus: () => timeRef.current?.focus() };
    if (state.journey === "return" && !state.returnDate) return { message: "When are we bringing you back?", focus: () => document.getElementById("b-retdate")?.focus() };
    if (state.journey === "return" && !state.returnTime) return { message: "And at what time?", focus: () => document.getElementById("b-rettime")?.focus() };
    return null;
  }, [state, fromAirport, toAirport]);
  useEffect(() => registerValidator(validate), [validate, registerValidator]);

  // §3.7 return labels follow the route
  const returnTimeLabel = fromAirport
    ? "Return flight departs"
    : toAirport
    ? "Return flight lands"
    : "Collect us at";

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
      <div className="pkick">{heading.kick}</div>
      <h2>{heading.h}</h2>
      <p className="psub">{heading.sub}</p>

      <PlaceCombobox label="Pick up" value={state.from} onSelect={(s) => setField("from", s)} inputRef={fromInput} />
      <div className="qswap-row">
        <button type="button" className="qswap" aria-label="Swap pickup and drop-off" onClick={swap}>⇅</button>
      </div>
      <PlaceCombobox label="Drop off" value={state.to} onSelect={(s) => setField("to", s)} inputRef={toInput} />

      <div className="frow" style={{ marginTop: 18 }}>
        <div className="fld">
          <label htmlFor="b-date">Date</label>
          <input id="b-date" ref={dateRef} type="date" value={state.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setField("date", e.target.value)} />
        </div>
        {fromAirport ? (
          <div className="fld">
            <label htmlFor="b-landing">Flight lands at</label>
            <input id="b-landing" ref={landingRef} type="time" value={state.flightLanding} onChange={(e) => setField("flightLanding", e.target.value)} />
          </div>
        ) : toAirport ? (
          <div className="fld">
            <label htmlFor="b-dep">Flight departs at</label>
            <input id="b-dep" ref={depRef} type="time" value={state.depTime} onChange={(e) => setField("depTime", e.target.value)} />
          </div>
        ) : (
          <div className="fld">
            <label htmlFor="b-time">Pickup time</label>
            <input id="b-time" ref={timeRef} type="time" value={state.pickupTime} onChange={(e) => setField("pickupTime", e.target.value)} />
          </div>
        )}
      </div>

      {fromAirport && (
        <div className="fld">
          <label htmlFor="b-flight">Flight number <span className="soft">— we'll track it</span></label>
          <input id="b-flight" type="text" inputMode="text" autoCapitalize="characters" placeholder="e.g. KL767, AA1234" value={state.flightNumber} onChange={(e) => setField("flightNumber", e.target.value)} />
        </div>
      )}

      {toAirport && (
        <div className="fld">
          <label>Where are you flying to?</label>
          <div className="qtoggle" role="radiogroup" aria-label="Destination">
            <button type="button" role="radio" aria-checked={state.destUS} className={state.destUS ? "on" : ""} onClick={() => setField("destUS", true)}>United States</button>
            <button type="button" role="radio" aria-checked={!state.destUS} className={!state.destUS ? "on" : ""} onClick={() => setField("destUS", false)}>Anywhere else</button>
          </div>
        </div>
      )}

      {derived?.kind === "arrive" && (
        <div className="timing" role="status">
          <b>Your driver waits from {derived.at}</b>
          <p>
            {state.flightNumber ? `${state.flightNumber.toUpperCase().replace(/\s+/g, "")} lands` : "Your flight lands"} at {state.flightLanding}.
            He's inside arrivals 30 minutes later — and if the flight moves, we move with it. Waiting is free.
          </p>
        </div>
      )}
      {derived?.kind === "depart" && (
        <div className="timing" role="status">
          <b>We collect you at {derived.at}</b>
          <p>
            {state.destUS
              ? `Aruba clears US immigration before you fly, so you need 3 hours at the airport. We've worked backwards from ${state.depTime}.`
              : `International check-in wants 2 hours 15. We've worked backwards from ${state.depTime}.`}
          </p>
        </div>
      )}

      {shortNotice && (
        <div className="notice" role="status">
          Rides inside 3 hours need a human. Book it here and we'll confirm on WhatsApp within
          10 minutes — or message us first if you'd rather.
        </div>
      )}

      <div className="fld">
        <label>Journey</label>
        <div className="qtoggle" role="radiogroup" aria-label="Journey">
          <button type="button" role="radio" aria-checked={state.journey === "one"} className={state.journey === "one" ? "on" : ""} onClick={() => setField("journey", "one")}>One way</button>
          <button type="button" role="radio" aria-checked={state.journey === "return"} className={state.journey === "return" ? "on" : ""} onClick={() => setField("journey", "return")}>Bring us back</button>
        </div>
      </div>

      {state.journey === "return" && (
        <div className="frow">
          <div className="fld">
            <label htmlFor="b-retdate">Return date</label>
            <input id="b-retdate" type="date" value={state.returnDate} min={state.date} onChange={(e) => setField("returnDate", e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="b-rettime">{returnTimeLabel}</label>
            <input id="b-rettime" type="time" value={state.returnTime} onChange={(e) => setField("returnTime", e.target.value)} />
          </div>
        </div>
      )}
      {state.journey === "return" && fromAirport && state.returnTime && (
        <div className="timing" role="status">
          <b>We collect you at {collectAt(state.returnTime, state.returnDestUS)}</b>
          <p>
            <button type="button" className={`qtoggle-inline${state.returnDestUS ? " on" : ""}`} style={{ textDecoration: "underline" }} onClick={() => setField("returnDestUS", !state.returnDestUS)}>
              {state.returnDestUS ? "Flying to the US (3 h) — tap if not" : "Flying elsewhere (2 h 15) — tap if US"}
            </button>
          </p>
        </div>
      )}

      <div className="subh">Guests &amp; bags</div>
      <div className="steppers">
        <div className="stw">
          <label>Guests</label>
          <Stepper value={state.pax} min={1} max={7} onChange={(v) => setField("pax", v)} testId="b-pax" />
        </div>
        <div className="stw">
          <label>Bags</label>
          <Stepper value={state.bags} min={0} max={8} onChange={(v) => setField("bags", v)} />
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
          const q = state.from && state.to && state.from.id !== state.to.id
            ? quote({ from: state.from, to: state.to, vehicle: v, isReturn: state.journey === "return", pricing })
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
              <span className="vmain">
                <span className="vn">{v.name}</span>
                <span className="vm">{v.desc} · {v.classLabel.toLowerCase()}</span>
                <span className="vs">{fits ? `Up to ${v.pax} guests · ${v.bags} bags` : `Seats ${v.pax} · your party doesn't fit`}</span>
              </span>
              {/* return already doubled here — the price cannot move at review */}
              <span className="vp">{q ? usd(q.totalUsd) : "—"}</span>
            </button>
          );
        })}
      </div>

      {hint && <div className="hint" role="alert">{hint}</div>}
    </div>
  );
}
