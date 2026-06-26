import { useBooking } from "../../booking/BookingContext";
import Diamond from "../Diamond";
import ProgressRail from "./ProgressRail";
import StageFooter from "./StageFooter";
import StepTrip from "./steps/StepTrip";
import StepRide from "./steps/StepRide";
import StepConfirm from "./steps/StepConfirm";
import type { ConfirmedBooking } from "./steps/StepConfirm";

interface BookingOverlayProps {
  onConfirmed?: (booking: ConfirmedBooking) => void;
}

function renderStep(step: number, onConfirmed?: (booking: ConfirmedBooking) => void) {
  switch (step) {
    case 0: return <StepTrip />;
    case 1: return <StepRide />;
    case 2: return <StepConfirm onConfirmed={onConfirmed} />;
    default: return <StepTrip />;
  }
}

export default function BookingOverlay({ onConfirmed }: BookingOverlayProps) {
  const { state, close, back } = useBooking();
  const overlayClass = ["overlay", state.open ? "open" : ""].filter(Boolean).join(" ");
  const backClass = ["btn-back", state.step === 0 ? "hidden" : ""].filter(Boolean).join(" ");
  // On the Confirm step, hide the standard "Continue" footer (StepConfirm has its own Confirm button)
  const showFooter = state.step !== 2;

  return (
    <div className={overlayClass} aria-modal="true" role="dialog">
      {/* scrim */}
      <div className="ov-scrim" onClick={close} />

      {/* panel */}
      <div className="ov-panel">
        {/* progress rail */}
        <aside className="rail">
          <div className="brand">
            <div className="mark">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                <defs>
                  <linearGradient id="rail-mg" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#EEF2F8" />
                    <stop offset="1" stopColor="#7E94B4" />
                  </linearGradient>
                </defs>
                <path
                  d="M32 13.76 A 13 13 0 1 0 32 34.24"
                  stroke="url(#rail-mg)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <circle cx="32" cy="34.24" r="3" fill="var(--accent)" />
              </svg>
            </div>
            <div className="wordmark">
              <span className="name">Cabby's</span>
              <span className="tag"><Diamond />&nbsp;Aruba</span>
            </div>
          </div>

          <ProgressRail />

          <div className="rail-foot">
            Every fare is fixed before you confirm. The 6% government &amp; facility tax is shown in your summary.
          </div>
        </aside>

        {/* stage */}
        <main className="stage">
          <div className="stage-top">
            <button className={backClass} onClick={back}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>

            <span className="mob-prog">Step {state.step + 1} of 3</span>

            <button className="ov-close" onClick={close} aria-label="Close booking">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="stage-body">
            {renderStep(state.step, onConfirmed)}
          </div>

          {showFooter && <StageFooter />}
        </main>
      </div>
    </div>
  );
}
