// Step 1 — YOUR CAR. Party, child seats and the fleet, with every fare
// already carrying the route it was quoted for.
//
// The route used to have a step to itself, and then a band at the top of
// this one. Both were a second asking: the card on the home page takes the
// route, the day, the hour and the party before the flow ever opens, and
// every "Book now" on the site now comes through that card (useStartBooking)
// rather than around it. So this screen asks the one thing the card cannot:
// which car, now that the fare for each of them is known.
import { useEffect, useRef } from "react";
import { useBooking } from "../../../booking/BookingContext";
import Stepper from "../../Stepper";
import LiveMap from "../LiveMap";
import VehiclePhoto from "../VehiclePhoto";
import { MAX_BAGS, MAX_PAX, VEHICLES, fitsParty } from "../../../data/vehicles";
import { quote, usd, CHILD_SEAT_USD, MAX_CHILD_SEATS } from "../../../lib/quote";
import type { Pricing } from "../../../lib/pricing";
import { SEAT_AGE_OPTIONS, firstMissingSeatAge } from "../../../lib/childSeats";
import FieldError from "../FieldError";
import { effectivePickupTime, type StepProblem } from "./shared";

/** The rail map's height, mirrored by .pcol-rail .tripmap .lmap in
    globals.css — change both. */
const MAP_H = 340;

/** Ordinals for the age fields' labels. MAX_CHILD_SEATS is two, so two
    words; a third seat would need a third word here, and a test. */
const NTH = ["First", "Second"] as const;

interface Step2Props {
  pricing: Pricing | null;
  /** the blocked field, if any — only a seat's age can block this step */
  problem: StepProblem | null;
  registerValidator: (fn: () => StepProblem | null) => void;
  /** the total + primary action, rendered flat under the map rail */
  foot: React.ReactNode;
}

export default function Step2Car({ pricing, problem, registerValidator, foot }: Step2Props) {
  const { state, setField } = useBooking();
  const carsRef = useRef<HTMLDivElement>(null);

  const time = effectivePickupTime(state);
  const selVehicle = VEHICLES.find((v) => v.id === state.vehicle) ?? VEHICLES[0];
  const routed = !!(state.from && state.to && state.from.id !== state.to.id);
  const isReturn = state.journey === "return";
  // Seats go INTO each row's quote, so the number beside every car is the
  // whole bill for that car — never a ride price with the seats left for
  // the review to spring on the guest.
  const selQuote = routed
    ? quote({ from: state.from!, to: state.to!, vehicle: selVehicle, isReturn, pricing, pickupTime: time, seats: state.seats })
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

  // One thing on this screen can be left blank: a child seat's age. The
  // party can never exceed what the largest vehicle carries, an unfittable
  // car cannot be selected, and the route arrived answered. The ages were
  // optional until seats became a paid add-on sold on fitting the child —
  // a seat with no age is a seat the driver has to guess at.
  useEffect(() => registerValidator(() => {
    const i = firstMissingSeatAge(state.seats, state.seatAges);
    if (i < 0) return null;
    return {
      field: `seat-age-${i}`,
      message: state.seats === 1
        ? "Choose your child's age, so we bring a seat that fits."
        : `Choose the ${NTH[i].toLowerCase()} child's age, so we bring a seat that fits.`,
      focus: () => document.getElementById(`b-age-${i}`)?.focus(),
    };
  }), [registerValidator, state.seats, state.seatAges]);

  const err = (f: string) => (problem?.field === f ? problem.message : undefined);
  const errId = (f: string) => (problem?.field === f ? `err-${f}` : undefined);

  /** Seats and their ages move together: dropping to one seat drops the
      second age, so a stale age can never come back with a new seat. */
  function setSeats(n: number) {
    setField("seats", n);
    if (state.seatAges.length > n) setField("seatAges", state.seatAges.slice(0, n));
  }
  function setAge(i: number, value: string) {
    const next = Array.from({ length: state.seats }, (_, k) => state.seatAges[k] ?? "");
    next[i] = value;
    setField("seatAges", next);
  }

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
        {/* The screen greets what it is FOR. It used to greet the route,
            back when the route was on it — the flight moved to the details
            step with the name it gets printed beside. */}
        <h2>Who's coming, and in <em>what?</em></h2>
        {/* "the route already set it" stopped being the whole story once a
            seat had a price; with seats on, the line says they are in. */}
        <p className="psub">{state.seats > 0
          ? "Every fare below is all in — the route and your child seats."
          : "Every fare below is all in — the route already set it."}</p>
      </div>

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
          <Stepper value={state.seats} min={0} max={MAX_CHILD_SEATS} onChange={setSeats} />
        </div>
      </div>

      {/* The seats' ages, then what they cost — the moment a seat is
          added, not at review. The cost line names the per-seat price and
          what it adds to THIS booking, because the rows below already
          include it and a total that grows with no line explaining it
          reads as a price that moved. */}
      {state.seats > 0 && (
        <div className="seatbox">
          <div className={state.seats > 1 ? "frow" : undefined}>
            {Array.from({ length: state.seats }, (_, i) => {
              const f = `seat-age-${i}`;
              return (
                <div className="fld" key={i}>
                  <label htmlFor={`b-age-${i}`}>
                    {state.seats === 1 ? "Child's age" : `${NTH[i]} child's age`}
                  </label>
                  <select id={`b-age-${i}`} value={state.seatAges[i] ?? ""} required
                    aria-invalid={!!err(f) || undefined} aria-describedby={errId(f)}
                    onChange={(e) => setAge(i, e.target.value)}>
                    <option value="" disabled>Choose an age</option>
                    {SEAT_AGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <FieldError id={`err-${f}`} message={err(f)} />
                </div>
              );
            })}
          </div>
          <p className="seatfee">
            {/* "×2 · $10 each way" could be read as $10 for both seats */}
            <span className="sf-l">
              Child seat{state.seats > 1 ? "s" : ""} ×{state.seats} · {usd(CHILD_SEAT_USD)} {state.seats > 1 ? "per seat, each way" : "each way"}
            </span>
            {selQuote && (
              <span className="sf-r">
                +{usd(selQuote.seatsUsd)}{isReturn ? " for both ways" : ""}, already in every fare below
              </span>
            )}
          </p>
        </div>
      )}

      <div className="subh">Your car</div>
      <div role="radiogroup" aria-label="Choose your car" ref={carsRef} onKeyDown={onCarsKeyDown}>
        {VEHICLES.map((v) => {
          const fits = fitsParty(v, state.pax, state.bags);
          const selected = state.vehicle === v.id;
          const q = routed
            ? quote({ from: state.from!, to: state.to!, vehicle: v, isReturn, pricing, pickupTime: time, seats: state.seats })
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
                {/* No make and model line ("Mercedes E-Class or similar").
                    Drivers come in their own cars, and once the photos became
                    generic renders the named model no longer matched the
                    picture beside it. The photo and the tier name carry it. */}
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
