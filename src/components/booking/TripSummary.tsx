// The route, as a line you can edit rather than a step you repeat.
//
// The hero card already asked where, when and how many (§08). Asking again on
// the flow's first screen was the whole reason that screen existed, so it is
// gone; this takes its place at the top of the flow, and carries the two
// things the card had no way to ask:
//
//   · the flight time, on an airport run, because the pickup is DERIVED from
//     it — the driver waits from 30 minutes after you land, and the fare
//     knows whether that lands in the night window
//   · the return leg, when the card's Round Trip is on
//
// Someone who reaches the flow from "Book now" rather than the card has no
// route at all. They type it here, in these same fields, instead of getting a
// step of their own.
import { useBooking } from "../../booking/BookingContext";
import PlaceCombobox from "./PlaceCombobox";
import DateField from "./DateField";
import TimeField from "./TimeField";
import FieldError from "./FieldError";
import { formatDate, formatTime, todayInAruba } from "../../lib/datetime";
import { driverWaitsFrom, collectAt, insideMinNotice, MIN_NOTICE_HOURS } from "../../lib/derivedTime";
import { CONFIRM_WINDOW_MINUTES } from "../../lib/policy";
import { AIRPORT_ID } from "../../data/places";
import type { StepProblem } from "./steps/shared";

const Pin = (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 18s6-6.5 6-10a6 6 0 1 0-12 0c0 3.5 6 10 6 10z" /><circle cx="10" cy="8" r="2" />
  </svg>
);

interface TripSummaryProps {
  problem: StepProblem | null;
  fromRef?: React.RefObject<HTMLInputElement | null>;
  toRef?: React.RefObject<HTMLInputElement | null>;
  /** the chosen car's fare falls in the night window — said once, here,
      because it is a fact about the HOUR, not about the car */
  lateNight?: boolean;
}

export default function TripSummary({ problem, fromRef, toRef, lateNight }: TripSummaryProps) {
  const { state, setField, swap } = useBooking();
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;

  const err = (f: string) => (problem?.field === f ? problem.message : undefined);
  const errId = (f: string) => (problem?.field === f ? `err-${f}` : undefined);

  // §3.6 — the derived pickup moment
  const derived = fromAirport && state.flightLanding
    ? { at: driverWaitsFrom(state.flightLanding), kind: "arrive" as const }
    : toAirport && state.depTime
    ? { at: collectAt(state.depTime, state.destUS), kind: "depart" as const }
    : null;
  const effective = derived?.at ?? (fromAirport || toAirport ? "" : state.pickupTime);
  const shortNotice = insideMinNotice(state.date, effective || state.flightLanding || state.depTime);

  const returnTimeLabel = fromAirport ? "Return flight departs"
    : toAirport ? "Return flight lands"
    : "Collect us at";

  return (
    <section className="trip" aria-label="Your trip">
      <div className="trip-route">
        <div className="trip-f">
          <PlaceCombobox label="From" value={state.from} onSelect={(s) => setField("from", s)}
            placeholder="Airport, Hotel, Address" inputRef={fromRef} icon={Pin}
            invalid={!!err("from")} describedBy={errId("from")} />
          <FieldError id="err-from" message={err("from")} />
        </div>
        <button type="button" className="trip-swap" onClick={swap} aria-label="Reverse pickup and drop-off">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 4v12M6 4L3 7M6 4l3 3M14 16V4M14 16l3-3M14 16l-3-3" />
          </svg>
        </button>
        <div className="trip-f">
          <PlaceCombobox label="To" value={state.to} onSelect={(s) => setField("to", s)}
            placeholder="Hotel, Address, Destination" inputRef={toRef} icon={Pin}
            invalid={!!err("to")} describedBy={errId("to")} />
          <FieldError id="err-to" message={err("to")} />
        </div>
      </div>

      <div className="trip-when">
        <div className="trip-f">
          <DateField id="b-date" label="Date" value={state.date} min={todayInAruba()}
            onChange={(iso) => setField("date", iso)} invalid={!!err("date")} describedBy={errId("date")} compact />
          <FieldError id="err-date" message={err("date")} />
        </div>

        {/* An airport run is timed off the flight, never off a guess. */}
        {fromAirport ? (
          <div className="trip-f">
            <TimeField id="b-landing" label="Flight lands at" value={state.flightLanding}
              onChange={(t) => setField("flightLanding", t)} invalid={!!err("landing")} describedBy={errId("landing")} />
            <FieldError id="err-landing" message={err("landing")} />
          </div>
        ) : toAirport ? (
          <div className="trip-f">
            <TimeField id="b-dep" label="Flight departs at" value={state.depTime}
              onChange={(t) => setField("depTime", t)} invalid={!!err("dep")} describedBy={errId("dep")} />
            <FieldError id="err-dep" message={err("dep")} />
          </div>
        ) : (
          <div className="trip-f">
            <TimeField id="b-time" label="Pickup time" value={state.pickupTime}
              onChange={(t) => setField("pickupTime", t)} invalid={!!err("time")} describedBy={errId("time")} />
            <FieldError id="err-time" message={err("time")} />
          </div>
        )}

        {/* The one thing that makes "we track your flight" true — beside the
            time it belongs to, not on a line of its own below it. */}
        {fromAirport && (
          <div className="trip-f">
            <label className="trip-l" htmlFor="b-flight">Flight no. <span className="soft">— we'll track it</span></label>
            <input id="b-flight" type="text" inputMode="text" autoCapitalize="characters"
              placeholder="KL767" value={state.flightNumber}
              onChange={(e) => setField("flightNumber", e.target.value)} />
          </div>
        )}

        {/* Return is a property of the trip, so it sits with the dates it
            changes. The hero card asked it first; someone who came in from
            "Book now" is asked it here, and nowhere twice. */}
        <div className="trip-f trip-f-journey">
          <span className="trip-l">Journey</span>
          <div className="qtoggle qtoggle-sm" role="radiogroup" aria-label="Journey">
            <button type="button" role="radio" aria-checked={state.journey === "one"}
              className={state.journey === "one" ? "on" : ""}
              onClick={() => setField("journey", "one")}>One way</button>
            <button type="button" role="radio" aria-checked={state.journey === "return"}
              className={state.journey === "return" ? "on" : ""}
              onClick={() => setField("journey", "return")}>Return</button>
          </div>
        </div>
      </div>

      {toAirport && (
        <div className="fld">
          <label>Where are you flying to?</label>
          <div className="qtoggle" role="radiogroup" aria-label="Destination">
            <button type="button" role="radio" aria-checked={state.destUS} className={state.destUS ? "on" : ""}
              onClick={() => setField("destUS", true)}>United States</button>
            <button type="button" role="radio" aria-checked={!state.destUS} className={!state.destUS ? "on" : ""}
              onClick={() => setField("destUS", false)}>Anywhere else</button>
          </div>
        </div>
      )}

      {state.journey === "return" && (
        <div className="trip-when">
          <div className="trip-f">
            <DateField id="b-retdate" label="Return date" value={state.returnDate}
              min={state.date || todayInAruba()} onChange={(iso) => setField("returnDate", iso)}
              invalid={!!err("retdate")} describedBy={errId("retdate")} compact />
            <FieldError id="err-retdate" message={err("retdate")} />
          </div>
          <div className="trip-f">
            <TimeField id="b-rettime" label={returnTimeLabel} value={state.returnTime}
              onChange={(t) => setField("returnTime", t)} invalid={!!err("rettime")} describedBy={errId("rettime")} />
            <FieldError id="err-rettime" message={err("rettime")} />
          </div>
        </div>
      )}

      {derived?.kind === "arrive" && (
        <div className="timing" role="status">
          <b>Your driver waits from {formatTime(derived.at)}</b>
          <p>
            {state.flightNumber ? `${state.flightNumber.toUpperCase().replace(/\s+/g, "")} lands` : "Your flight lands"} at {formatTime(state.flightLanding)} Aruba time.
            He's inside arrivals 30 minutes later — and if the flight moves, we move with it. Waiting is free.
          </p>
        </div>
      )}
      {derived?.kind === "depart" && (
        <div className="timing" role="status">
          <b>We collect you at {formatTime(derived.at)}</b>
          <p>
            {state.destUS
              ? `Aruba clears US immigration before you fly, so you need 3 hours at the airport. We've worked backwards from ${formatTime(state.depTime)}.`
              : `International check-in wants 2 hours 15. We've worked backwards from ${formatTime(state.depTime)}.`}
          </p>
        </div>
      )}
      {state.journey === "return" && fromAirport && state.returnTime && (
        <div className="timing" role="status">
          <b>We collect you at {formatTime(collectAt(state.returnTime, state.returnDestUS))}</b>
          <p>
            <button type="button" className={`qtoggle-inline${state.returnDestUS ? " on" : ""}`}
              style={{ textDecoration: "underline" }} onClick={() => setField("returnDestUS", !state.returnDestUS)}>
              {state.returnDestUS ? "Flying to the US (3 h) — tap if not" : "Flying elsewhere (2 h 15) — tap if US"}
            </button>
          </p>
        </div>
      )}
      {lateNight && (
        <div className="notice" role="status">
          A night rate applies at this hour. It is already inside every price on this page.
        </div>
      )}
      {shortNotice && (
        <div className="notice" role="status">
          Rides inside {MIN_NOTICE_HOURS} hours need a human. Book it here and we'll confirm on
          WhatsApp within {CONFIRM_WINDOW_MINUTES} minutes — or message us first if you'd rather.
        </div>
      )}
    </section>
  );
}

/** The route and schedule questions, checked in the order they are read.
    Lives here rather than in a step, because the fields do. */
export function validateTrip(
  state: ReturnType<typeof useBooking>["state"],
  focus: { from?: () => void; to?: () => void; byId: (id: string) => () => void },
): StepProblem | null {
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  if (!state.from) return { field: "from", message: "Tell us where to pick you up first.", focus: focus.from };
  if (!state.to) return { field: "to", message: "And where you're headed.", focus: focus.to };
  if (state.from.id === state.to.id) return { field: "to", message: "Pickup and drop-off are the same place — change one.", focus: focus.to };
  if (!state.date) return { field: "date", message: "Which day is this for?", focus: focus.byId("b-date") };
  if (fromAirport && !state.flightLanding) return { field: "landing", message: "When does your flight land? Set the hour, minutes and AM/PM.", focus: focus.byId("b-landing") };
  if (toAirport && !state.depTime) return { field: "dep", message: "When does your flight leave? Set the hour, minutes and AM/PM.", focus: focus.byId("b-dep") };
  if (!fromAirport && !toAirport && !state.pickupTime) return { field: "time", message: "What time should the car be there? Set the hour, minutes and AM/PM.", focus: focus.byId("b-time") };
  if (state.journey === "return") {
    if (!state.returnDate) return { field: "retdate", message: "When are we bringing you back?", focus: focus.byId("b-retdate") };
    if (state.date && state.returnDate < state.date)
      return { field: "retdate", message: `The way back can't be before ${formatDate(state.date)}.`, focus: focus.byId("b-retdate") };
    if (!state.returnTime) return { field: "rettime", message: "And at what time?", focus: focus.byId("b-rettime") };
  }
  return null;
}
