import { useBooking } from "../../../booking/BookingContext";
import { JOURNEYS } from "../../../data/journeys";
import Icon from "../../Icon";

export default function StepJourney() {
  const { state, setField } = useBooking();

  return (
    <div>
      <div className="step-eyebrow">The occasion</div>
      <h2 className="step-title">What brings you out?</h2>
      <p className="step-desc">
        Every journey is a private car and a fixed fare. Tell us the shape of it.
      </p>

      <div className="jt-grid">
        {JOURNEYS.map((j) => {
          const isOn = state.journey === j.key;
          return (
            <button
              key={j.key}
              type="button"
              className={["jt", isOn ? "on" : ""].filter(Boolean).join(" ")}
              onClick={() => setField("journey", j.key)}
            >
              <div className="jt-ico">
                <Icon name={j.icon} size={22} />
              </div>
              <div>
                <div className="jt-t">{j.title}</div>
                <div className="jt-d">{j.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
