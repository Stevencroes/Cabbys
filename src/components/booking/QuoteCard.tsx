// §08 — the hero booking card. One way or return, five answers in a row,
// and the way on. It no longer quotes: the mockup asks for availability
// first and shows money once the route is real, so the rate card is loaded
// by the flow that spends it rather than by the card that opens it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useBooking } from "../../booking/BookingContext";
import PlaceCombobox from "./PlaceCombobox";
import DateField from "./DateField";
import TimeField from "./TimeField";
import { todayInAruba } from "../../lib/datetime";
import { isOnIsland, locate } from "../../lib/geo";
import { AIRPORT, AIRPORT_ID, selFromCustom, selFromPlace } from "../../data/places";
import { MAX_PAX } from "../../data/vehicles";
import { CARD_ID } from "../../booking/useStartBooking";

export default function QuoteCard() {
  const { state, setField, open } = useBooking();
  const [hint, setHint] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const onIsland = useMemo(() => isOnIsland(), []);
  const fromInput = useRef<HTMLInputElement | null>(null);
  const toInput = useRef<HTMLInputElement | null>(null);

  // §3.8 — planning from abroad: pickup pre-fills to the airport; guests
  // already on the island get an empty form (they know where they are).
  useEffect(() => {
    if (!onIsland && !state.from) setField("from", selFromPlace(AIRPORT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLocate() {
    const res = await locate();
    setLocMsg(res.message);
    if (res.ok && res.area) {
      setField("from", selFromCustom(`Near ${res.area.name}`, res.area));
    } else {
      // off-island or denied — fall back kindly to the airport
      setField("from", selFromPlace(AIRPORT));
    }
  }

  // The card asks the ONE time question the route actually has. An airport
  // pickup is timed off the landing, a departure off the take-off, and the
  // driver's moment is worked out from there — so asking for a "pickup time"
  // on an airport run collects a number nothing uses and then asks for the
  // flight anyway. The flow downstream never asks the hour twice.
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  const when = fromAirport
    ? { label: "Flight lands", ph: "Landing", key: "flightLanding" as const, value: state.flightLanding }
    : toAirport
    ? { label: "Flight departs", ph: "Departure", key: "depTime" as const, value: state.depTime }
    : { label: "Time", ph: "Pick up", key: "pickupTime" as const, value: state.pickupTime };

  // Continue is never disabled — an empty field gets focus and a reason.
  function handleContinue() {
    if (!state.from) {
      setHint("Tell us where to pick you up first.");
      fromInput.current?.focus();
      return;
    }
    if (!state.to) {
      setHint("And where you're headed.");
      toInput.current?.focus();
      return;
    }
    if (state.from.id === state.to.id) {
      setHint("Pickup and drop-off are the same place — change one of them.");
      toInput.current?.focus();
      return;
    }
    if (!when.value) {
      setHint(fromAirport ? "When does your flight land? Set the hour, minutes and AM/PM."
        : toAirport ? "When does your flight leave? Set the hour, minutes and AM/PM."
        : "What time should the car be there? Set the hour, minutes and AM/PM.");
      document.getElementById("q-time")?.focus();
      return;
    }
    setHint("");
    open(); // everything already lives in context — nothing is asked twice
  }

  const Pin = (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 18s6-6.5 6-10a6 6 0 1 0-12 0c0 3.5 6 10 6 10z" /><circle cx="10" cy="8" r="2" />
    </svg>
  );

  return (
    // Every "Book now" on the site lands here when it has no route to
    // open the flow with, so the card needs a name to be scrolled to.
    <div className="quote rise" id={CARD_ID}>
      {/* §08 — one way or return, then the five answers in a row, then the
          way on. The card carries no fare: the mockup asks for availability
          first and shows the money once the route is real. */}
      <div className="qtabs" role="tablist" aria-label="Trip type">
        <button type="button" role="tab" aria-selected={state.journey === "one"}
          className={state.journey === "one" ? "on" : ""}
          onClick={() => setField("journey", "one")}>One Way</button>
        <button type="button" role="tab" aria-selected={state.journey === "return"}
          className={state.journey === "return" ? "on" : ""}
          onClick={() => setField("journey", "return")}>Round Trip</button>
      </div>

      <div className="qrow">
        <div className="qcell">
          <PlaceCombobox
            label="From"
            value={state.from}
            onSelect={(sel) => setField("from", sel)}
            placeholder={onIsland ? "Where are you now?" : "Airport, Hotel, Address"}
            inputRef={fromInput}
            icon={Pin}
          />
        </div>

        <div className="qcell">
          <PlaceCombobox
            label="To"
            value={state.to}
            onSelect={(sel) => setField("to", sel)}
            placeholder="Hotel, Address, Destination"
            inputRef={toInput}
            icon={Pin}
          />
        </div>

        <div className="qcell qcell-date">
          <DateField
            id="q-date"
            label="Date"
            value={state.date}
            min={todayInAruba()}
            onChange={(iso) => setField("date", iso)}
            compact
          />
        </div>

        {/* The hour, asked once, in the terms the route puts it in. */}
        <div className="qcell qcell-time">
          <TimeField
            id="q-time"
            label={when.label}
            value={when.value}
            onChange={(t) => setField(when.key, t)}
            placeholder={when.ph}
            hideZone
          />
        </div>

        <div className="qcell qcell-pax">
          <label className="qpax" htmlFor="q-pax">
            <span className="qpax-l">Passengers</span>
            <select id="q-pax" value={state.pax} onChange={(e) => setField("pax", +e.target.value)}>
              {Array.from({ length: MAX_PAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} Passenger{n > 1 ? "s" : ""}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {onIsland && (
        <button type="button" className="qloc" onClick={handleLocate}>Use my location</button>
      )}
      {locMsg && <div className="qhint" role="status">{locMsg}</div>}
      {hint && <div className="qhint" role="alert">{hint}</div>}

      <div className="qgo">
        <button type="button" className="qbtn" onClick={handleContinue}>
          Check availability
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10h13M11 5l5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
