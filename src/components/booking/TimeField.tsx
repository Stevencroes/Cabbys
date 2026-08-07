// A time picker with the meridiem said out loud.
//
// The native <input type="time"> renders 24-hour in most locales and its
// hour segment can silently refuse input, which is how a booking reached
// "--:30" and still advanced. Three plain selects can't hold a partial
// value: unless hour, minute and AM/PM are all chosen this emits "", and
// the step validators already refuse to advance on an empty time.
import { useEffect, useId, useState } from "react";
import { ARUBA_TZ_LABEL, to12Hour, to24Hour } from "../../lib/datetime";

interface TimeFieldProps {
  id: string;
  label: string;
  value: string;                 // "HH:MM" (24h) or ""
  onChange: (hhmm: string) => void;
  describedBy?: string;
  invalid?: boolean;
  /** hides the AST caption where a nearby field already carries it */
  hideZone?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export default function TimeField({
  id, label, value, onChange, describedBy, invalid, hideZone,
}: TimeFieldProps) {
  const uid = useId();
  const parsed = to12Hour(value);
  const [hour, setHour] = useState<string>(parsed ? String(parsed.hour) : "");
  const [minute, setMinute] = useState<string>(parsed ? String(parsed.minute) : "");
  const [meridiem, setMeridiem] = useState<string>(parsed ? parsed.meridiem : "");

  // adopt values set elsewhere (derived times, prefills, reset)
  useEffect(() => {
    const p = to12Hour(value);
    if (!p) {
      if (!value) { setHour(""); setMinute(""); setMeridiem(""); }
      return;
    }
    setHour(String(p.hour));
    setMinute(String(p.minute));
    setMeridiem(p.meridiem);
  }, [value]);

  function emit(h: string, m: string, ap: string) {
    if (h && m !== "" && ap) {
      onChange(to24Hour({ hour: +h, minute: +m, meridiem: ap as "AM" | "PM" }));
    } else {
      onChange(""); // partial is never a value
    }
  }

  const zoneId = `${uid}-zone`;
  const description = [describedBy, hideZone ? null : zoneId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="timefield">
      <span className="dtf-label" id={`${uid}-label`}>{label}</span>
      <div
        className={`tmf-row${invalid ? " invalid" : ""}`}
        role="group"
        aria-labelledby={`${uid}-label`}
        aria-describedby={description}
      >
        <select
          id={id}
          className="tmf-sel"
          aria-label={`${label} — hour`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={hour}
          onChange={(e) => { setHour(e.target.value); emit(e.target.value, minute, meridiem); }}
        >
          <option value="">Hr</option>
          {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="tmf-colon" aria-hidden="true">:</span>
        <select
          className="tmf-sel"
          aria-label={`${label} — minute`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={minute}
          onChange={(e) => { setMinute(e.target.value); emit(hour, e.target.value, meridiem); }}
        >
          <option value="">Min</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
          ))}
        </select>
        <select
          className="tmf-sel tmf-ap"
          aria-label={`${label} — AM or PM`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={meridiem}
          onChange={(e) => { setMeridiem(e.target.value); emit(hour, minute, e.target.value); }}
        >
          <option value="">--</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      {!hideZone && (
        <span className="tmf-zone" id={zoneId}>{ARUBA_TZ_LABEL}</span>
      )}
    </div>
  );
}
