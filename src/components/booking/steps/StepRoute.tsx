import { useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { AIRPORT, HOTELS, CUSTOM_LOC, type Place } from "../../../data/hotels";
import Icon from "../../Icon";

const ALL_OPTIONS: Place[] = [AIRPORT, ...HOTELS, CUSTOM_LOC];

function LocationPicker({
  label,
  icon,
  selected,
  customValue,
  onSelect,
  onCustomChange,
}: {
  label: string;
  icon: React.ReactNode;
  selected: string;
  customValue: string;
  onSelect: (place: Place) => void;
  onCustomChange: (value: string) => void;
}) {
  const showCustomInput = selected === CUSTOM_LOC.id;

  return (
    <div className="loc-block">
      <div className="field-label">
        {icon}
        {label}
      </div>
      <div className="opt-list">
        {ALL_OPTIONS.map((place) => {
          const isOn = selected === place.id;
          return (
            <button
              key={place.id}
              type="button"
              className={["opt", isOn ? "on" : ""].filter(Boolean).join(" ")}
              onClick={() => onSelect(place)}
            >
              <span className="opt-l">
                <span className="opt-ico">
                  <Icon name={place.id === "airport" ? "plane" : place.id === "custom" ? "pin" : "bed"} size={16} />
                </span>
                <span>
                  <div className="opt-name">{place.name}</div>
                  <div className="opt-meta">{place.meta}</div>
                </span>
              </span>
              <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </button>
          );
        })}
      </div>
      {showCustomInput && (
        <input
          className="txt"
          style={{ marginTop: "9px" }}
          placeholder={label === "Pickup" ? "Or type a pickup address" : "Or type a destination address"}
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
        />
      )}
    </div>
  );
}

export default function StepRoute() {
  const { state, setField } = useBooking();

  const [fromId, setFromId] = useState<string>(
    state.from === CUSTOM_LOC.name || state.fromCustom ? CUSTOM_LOC.id :
    ALL_OPTIONS.find((p) => p.name === state.from)?.id ?? ""
  );
  const [toId, setToId] = useState<string>(
    state.to === CUSTOM_LOC.name || state.toCustom ? CUSTOM_LOC.id :
    ALL_OPTIONS.find((p) => p.name === state.to)?.id ?? ""
  );

  function handleFromSelect(place: Place) {
    setFromId(place.id);
    if (place.id === CUSTOM_LOC.id) {
      // Keep from as whatever was typed in custom field or clear
      setField("from", state.fromCustom || "");
    } else {
      setField("from", place.name);
      setField("fromCustom", "");
    }
  }

  function handleToSelect(place: Place) {
    setToId(place.id);
    if (place.id === CUSTOM_LOC.id) {
      setField("to", state.toCustom || "");
    } else {
      setField("to", place.name);
      setField("toCustom", "");
    }
  }

  function handleFromCustomChange(value: string) {
    setField("fromCustom", value);
    setField("from", value);
  }

  function handleToCustomChange(value: string) {
    setField("toCustom", value);
    setField("to", value);
  }

  return (
    <div>
      <div className="step-eyebrow">Pickup &amp; destination</div>
      <h2 className="step-title">Where to, and from.</h2>
      <p className="step-desc">
        Choose a resort partner or the airport, or name a place of your own.
      </p>

      <LocationPicker
        label="Pickup"
        icon={<span className="ring" style={{ width: "9px", height: "9px" }} />}
        selected={fromId}
        customValue={state.fromCustom}
        onSelect={handleFromSelect}
        onCustomChange={handleFromCustomChange}
      />

      <LocationPicker
        label="Destination"
        icon={<span className="rdiamond" style={{ width: "9px", height: "9px" }} />}
        selected={toId}
        customValue={state.toCustom}
        onSelect={handleToSelect}
        onCustomChange={handleToCustomChange}
      />
    </div>
  );
}
