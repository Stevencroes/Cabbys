// §3.2 — the hero quote card. Symmetric pickup/drop-off, swap, instant
// fare from the SAME quote() the modal uses, Continue never disabled.
import { useEffect, useMemo, useRef, useState } from "react";
import { useBooking } from "../../booking/BookingContext";
import PlaceCombobox from "./PlaceCombobox";
import DateField from "./DateField";
import TimeField from "./TimeField";
import { todayInAruba } from "../../lib/datetime";
import { VEHICLES, fitsParty, type Vehicle } from "../../data/vehicles";
import { loadPricing, type Pricing } from "../../lib/pricing";
import { quote, usd } from "../../lib/quote";
import { isOnIsland, locate } from "../../lib/geo";
import { AIRPORT, selFromCustom, selFromPlace } from "../../data/places";

export function autoVehicle(pax: number, bags: number): Vehicle {
  return VEHICLES.find((v) => fitsParty(v, pax, bags)) ?? VEHICLES[VEHICLES.length - 1];
}

export default function QuoteCard() {
  const { state, setField, swap, open } = useBooking();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [hint, setHint] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const onIsland = useMemo(() => isOnIsland(), []);
  const fromInput = useRef<HTMLInputElement | null>(null);
  const toInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((p) => !cancelled && setPricing(p));
    return () => { cancelled = true; };
  }, []);

  // §3.8 — planning from abroad: pickup pre-fills to the airport; guests
  // already on the island get an empty form (they know where they are).
  useEffect(() => {
    if (!onIsland && !state.from) setField("from", selFromPlace(AIRPORT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same auto-selection rule as the modal (§3.4): bags default to
  // min(guests, 2), so hero and modal always agree on the vehicle.
  const bags = Math.min(state.pax, 2);
  const vehicle = autoVehicle(state.pax, bags);
  // No pickup time is asked for here, so this deliberately passes none:
  // quote() then prices at the neutral hour rather than at whatever the
  // viewer's own clock happens to say.
  const q = state.from && state.to && state.from.id !== state.to.id
    ? quote({ from: state.from, to: state.to, vehicle, isReturn: state.journey === "return", pricing })
    : null;

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
    setHint("");
    open(); // everything already lives in context — nothing is asked twice
  }

  return (
    <div className="quote rise">
      <div className="qtitle">Your fare, instantly</div>

      {/* Two fields, one rule under each. The swap used to sit between them
          as a bordered circle, which put a control in the one place the eye
          travels most — it is a rescue, not a step, so it waits at the end
          with the other quiet things. */}
      <PlaceCombobox
        label="Pick up"
        value={state.from}
        onSelect={(sel) => setField("from", sel)}
        placeholder={onIsland ? "Where are you now?" : "Airport, hotel or address"}
        inputRef={fromInput}
      />
      {onIsland && (
        <button type="button" className="qloc" onClick={handleLocate}>
          Use my location
        </button>
      )}
      {locMsg && <div className="qhint" role="status">{locMsg}</div>}

      <PlaceCombobox
        label="Drop off"
        value={state.to}
        onSelect={(sel) => setField("to", sel)}
        placeholder="Hotel, beach, restaurant…"
        inputRef={toInput}
      />

      <div className="qmini">
        <div className="qfld">
          <DateField
            id="q-date"
            label="Date"
            value={state.date}
            min={todayInAruba()}
            onChange={(iso) => setField("date", iso)}
            compact
          />
        </div>
        {/* Asked here so step 1 opens answered. An airport run derives its
            pickup from the flight instead, so the overlay overrides this. */}
        <div className="qfld">
          <TimeField
            id="q-time"
            label="Time"
            value={state.pickupTime}
            onChange={(t) => setField("pickupTime", t)}
            placeholder="Pick up"
            hideZone
          />
        </div>
      </div>

      {/* The quiet row: the thing most people never touch, and the thing
          they touch once. Neither earns a box. */}
      <div className="qquiet">
        <button type="button" className="qswap" aria-label="Reverse pickup and drop-off" onClick={swap}>
          <span aria-hidden="true">⇅</span> Reverse
        </button>
        <label className="qpax" htmlFor="q-pax">
          Guests
          <select id="q-pax" value={state.pax} onChange={(e) => setField("pax", +e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="qprice">
        <span className="pl">Your fare</span>
        <span className={q ? "pv" : "pv waiting"}>{q ? usd(q.totalUsd) : "—"}</span>
      </div>
      <div className="pm">
        {q ? `${q.minutes} min · all in · ${vehicle.name}` : "Choose your route to see it"}
      </div>

      {hint && <div className="qhint" role="alert">{hint}</div>}

      <button type="button" className="qbtn" onClick={handleContinue}>Continue</button>
      <div className="qfoot">All fares in US dollars · free cancellation up to 24h before</div>
    </div>
  );
}
