// What the card could not ask.
//
// The card on the home page takes the route, the day, the hour and the party
// (§08), and it asks the hour in the terms the route puts it in — a landing
// for an arrival, a take-off for a departure. So the flow never asks where,
// when or how many again. What is left over lives here, on the details step,
// beside the name it will be printed next to:
//
//   · the flight number, which is what makes "we track your flight" true
//   · where a departure is flying to, because US pre-clearance costs an hour
//   · the return leg, when the card's Round Trip is on
//
// and the notes that fall out of them — the moment the driver is actually
// there, and whether the ride is inside the window that needs a human.
import { useBooking } from "../../booking/BookingContext";
import DateField from "./DateField";
import TimeField from "./TimeField";
import FieldError from "./FieldError";
import { formatDate, formatTime, todayInAruba } from "../../lib/datetime";
import { driverWaitsFrom, collectAt, insideMinNotice, MIN_NOTICE_HOURS } from "../../lib/derivedTime";
import { CONFIRM_WINDOW_MINUTES } from "../../lib/policy";
import { AIRPORT_ID } from "../../data/places";
import type { StepProblem } from "./steps/shared";

interface TripScheduleProps {
  problem: StepProblem | null;
  /** the chosen car's fare falls in the night window — said once, here,
      because it is a fact about the HOUR, not about the car */
  lateNight?: boolean;
}

export default function TripSchedule({ problem, lateNight }: TripScheduleProps) {
  const { state, setField } = useBooking();
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
    <>
      {fromAirport && (
        <div className="fld">
          <label htmlFor="b-flight">Flight number <span className="soft">— we'll track it</span></label>
          <input id="b-flight" type="text" inputMode="text" autoCapitalize="characters"
            placeholder="e.g. KL767, AA1234" value={state.flightNumber}
            onChange={(e) => setField("flightNumber", e.target.value)} />
        </div>
      )}

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
        <div className="frow">
          <div className="fld">
            <DateField id="b-retdate" label="Return date" value={state.returnDate}
              min={state.date || todayInAruba()} onChange={(iso) => setField("returnDate", iso)}
              invalid={!!err("retdate")} describedBy={errId("retdate")} compact />
            <FieldError id="err-retdate" message={err("retdate")} />
          </div>
          <div className="fld">
            <TimeField id="b-rettime" label={returnTimeLabel} value={state.returnTime}
              onChange={(t) => setField("returnTime", t)}
              invalid={!!err("rettime")} describedBy={errId("rettime")} />
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
    </>
  );
}

/** What the flow still has to check. The card guarantees a route, a day and
    an hour before it opens the flow at all, so those are a backstop here
    rather than a question — there is no field on this screen to send anyone
    to, because there is no longer a screen that asks them. */
export function validateTrip(
  state: ReturnType<typeof useBooking>["state"],
  focus: { byId: (id: string) => () => void },
): StepProblem | null {
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  if (!state.from || !state.to || state.from.id === state.to.id)
    return { field: "route", message: "We've lost your route. Close this and start again from the booking card." };
  if (!state.date)
    return { field: "date", message: "We've lost your date. Close this and start again from the booking card." };
  if (fromAirport && !state.flightLanding)
    return { field: "landing", message: "We've lost your landing time. Close this and start again from the booking card." };
  if (toAirport && !state.depTime)
    return { field: "dep", message: "We've lost your flight time. Close this and start again from the booking card." };
  if (!fromAirport && !toAirport && !state.pickupTime)
    return { field: "time", message: "We've lost your pickup time. Close this and start again from the booking card." };
  if (state.journey === "return") {
    if (!state.returnDate) return { field: "retdate", message: "When are we bringing you back?", focus: focus.byId("b-retdate") };
    if (state.date && state.returnDate < state.date)
      return { field: "retdate", message: `The way back can't be before ${formatDate(state.date)}.`, focus: focus.byId("b-retdate") };
    if (!state.returnTime) return { field: "rettime", message: "And at what time?", focus: focus.byId("b-rettime") };
  }
  return null;
}
