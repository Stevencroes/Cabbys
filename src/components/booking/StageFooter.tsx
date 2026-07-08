import { useBooking } from "../../booking/BookingContext";
import { useFare } from "../../booking/useFare";
import { formatMoney } from "../../lib/currency";

export default function StageFooter() {
  const { next, canContinue, state, STEP_NAMES } = useBooking();
  const { loading, total } = useFare();
  const stepName = STEP_NAMES[state.step] ?? "";
  // Once a car is chosen the running total travels with the traveler.
  const showTotal = state.step >= 1 && !!state.vehicle && !loading && total > 0;

  return (
    <div className="stage-foot">
      <div className="foot-summary">
        {showTotal ? (
          <span>
            Total incl. tax <b>{formatMoney(total, "USD")}</b>
          </span>
        ) : stepName ? (
          <span>{stepName}</span>
        ) : (
          "Select an occasion to begin"
        )}
      </div>
      <button
        className="btn-primary"
        onClick={next}
        disabled={!canContinue}
      >
        Continue <span className="arr">→</span>
      </button>
    </div>
  );
}
