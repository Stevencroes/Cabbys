import { useBooking } from "../../../booking/BookingContext";
import Stepper from "../../Stepper";
import Icon from "../../Icon";

export default function StepParty() {
  const { state, setField } = useBooking();

  return (
    <div>
      <div className="step-eyebrow">Your party</div>
      <h2 className="step-title">Who&apos;s travelling?</h2>
      <p className="step-desc">
        So we send a car with room to spare. We&apos;ll only show vehicles that fit comfortably.
      </p>

      {/* Passengers */}
      <div className="count-row">
        <div className="cr-l">
          <div className="cr-ico">
            <Icon name="user" size={22} />
          </div>
          <div>
            <div className="cr-t">Passengers</div>
            <div className="cr-d">Including yourself</div>
          </div>
        </div>
        <div className="stepper">
          <button
            type="button"
            aria-label="−"
            disabled={state.passengers <= 1}
            onClick={() => state.passengers > 1 && setField("passengers", state.passengers - 1)}
          >
            −
          </button>
          <span className="num" data-testid="pax-num">{state.passengers}</span>
          <button
            type="button"
            aria-label="+"
            onClick={() => setField("passengers", state.passengers + 1)}
          >
            +
          </button>
        </div>
      </div>

      {/* Luggage */}
      <div className="count-row">
        <div className="cr-l">
          <div className="cr-ico">
            <Icon name="bag" size={22} />
          </div>
          <div>
            <div className="cr-t">Luggage</div>
            <div className="cr-d">Checked bags &amp; cases</div>
          </div>
        </div>
        <Stepper
          value={state.luggage}
          min={0}
          onChange={(v) => setField("luggage", v)}
        />
      </div>
    </div>
  );
}
