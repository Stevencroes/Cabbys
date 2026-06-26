import { useBooking } from "../../booking/BookingContext";

export default function StageFooter() {
  const { next, canContinue, state, STEP_NAMES } = useBooking();
  const stepName = STEP_NAMES[state.step] ?? "";

  return (
    <div className="stage-foot">
      <div className="foot-summary">
        {stepName ? <span>{stepName}</span> : "Select an occasion to begin"}
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
