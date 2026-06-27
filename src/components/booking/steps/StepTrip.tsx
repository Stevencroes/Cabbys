import { useEffect, useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import DestinationField from "../DestinationField";
import Stepper from "../../Stepper";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function StepTrip() {
  const { state, setField } = useBooking();
  const [active, setActive] = useState<"to" | "from">("to");
  const [mode, setMode] = useState<"now" | "schedule">(state.date && state.time ? "schedule" : "now");

  // "Now" → ensure date/time are populated so the step gate passes and the engine has a time.
  useEffect(() => {
    if (mode === "now") {
      setField("date", todayISO());
      setField("time", nowHHMM());
    }
  }, [mode, setField]);

  return (
    <div>
      <div className="step-eyebrow">Your trip</div>
      <h2 className="step-title">Where to?</h2>
      <p className="step-desc">Pick a place or type an address. Choose your pickup, when, and who is travelling.</p>

      <div className="trip-fields">
        <button type="button" className={`trip-row${active === "to" ? " on" : ""}`} onClick={() => setActive("to")}>
          <span className="rdiamond" />
          <span>
            <span className="tr-lbl" style={{ display: "block" }}>To</span>
            <span className={`tr-val${state.to ? "" : " placeholder"}`}>{state.to || "Choose destination"}</span>
          </span>
        </button>
        <button type="button" className={`trip-row${active === "from" ? " on" : ""}`} onClick={() => setActive("from")}>
          <span className="ring" />
          <span>
            <span className="tr-lbl" style={{ display: "block" }}>Pickup</span>
            <span className={`tr-val${state.from ? "" : " placeholder"}`}>{state.from || "Choose pickup"}</span>
          </span>
        </button>
      </div>

      <DestinationField target={active} onPicked={() => setActive(active === "to" ? "from" : "to")} />

      <div className="seg">
        <button type="button" className={mode === "now" ? "on" : ""} onClick={() => setMode("now")}>Now</button>
        <button type="button" className={mode === "schedule" ? "on" : ""} onClick={() => setMode("schedule")}>Schedule</button>
      </div>

      {mode === "schedule" && (
        <div className="field-pair" style={{ marginTop: "14px" }}>
          <input className="txt" type="date" value={state.date} onChange={(e) => setField("date", e.target.value)} />
          <input className="txt" type="time" value={state.time} onChange={(e) => setField("time", e.target.value)} />
        </div>
      )}

      <div className="count-row" style={{ marginTop: "18px" }}>
        <div className="cr-l">
          <div><div className="cr-t">Guests</div><div className="cr-d">Passengers travelling</div></div>
        </div>
        <Stepper value={state.passengers} min={1} onChange={(v) => setField("passengers", v)} testId="pax-num" />
      </div>
      <div className="count-row">
        <div className="cr-l">
          <div><div className="cr-t">Bags</div><div className="cr-d">Checked bags &amp; cases</div></div>
        </div>
        <Stepper value={state.luggage} min={0} onChange={(v) => setField("luggage", v)} />
      </div>
    </div>
  );
}
