import { useBooking } from "../../booking/BookingContext";
import Diamond from "../Diamond";
import StageFooter from "./StageFooter";
import StepTrip from "./steps/StepTrip";
import StepRide from "./steps/StepRide";
import StepDetails from "./steps/StepDetails";
import StepPay from "./steps/StepPay";
import type { ConfirmedBooking } from "../../booking/types";

interface BookingOverlayProps {
  onConfirmed?: (booking: ConfirmedBooking) => void;
}

function renderStep(step: number, onConfirmed?: (booking: ConfirmedBooking) => void) {
  switch (step) {
    case 0: return <StepTrip />;
    case 1: return <StepRide />;
    case 2: return <StepDetails />;
    case 3: return <StepPay onConfirmed={onConfirmed} />;
    default: return <StepTrip />;
  }
}

export default function BookingOverlay({ onConfirmed }: BookingOverlayProps) {
  const { state, close, back, STEP_NAMES } = useBooking();
  const overlayClass = ["overlay", state.open ? "open" : ""].filter(Boolean).join(" ");
  const backClass = ["btn-back", state.step === 0 ? "hidden" : ""].filter(Boolean).join(" ");
  // Pay owns its confirm button; every other step uses the shared footer.
  const showFooter = state.step !== 3;

  return (
    <div className={overlayClass} aria-modal="true" role="dialog">
      {/* scrim */}
      <div className="ov-scrim" onClick={close} />

      {/* panel */}
      <div className="ov-panel">
        {/* stage */}
        <main className="stage">
          <header className="stage-top">
            <div className="st-left">
              <span className="st-brand">
                <span className="st-mark">
                  <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
                    <path
                      d="M32 13.76 A 13 13 0 1 0 32 34.24"
                      stroke="var(--silver)"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                    <circle cx="32" cy="34.24" r="3" fill="var(--accent)" />
                  </svg>
                </span>
                <span className="st-word">Cabby's<Diamond /></span>
              </span>
              <button className={backClass} onClick={back}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back
              </button>
            </div>

            <nav className="ov-progress" aria-label="Booking progress">
              {STEP_NAMES.map((name, i) => {
                const done = i < state.step;
                const active = i === state.step;
                const cls = ["pstep", done ? "done" : "", active ? "active" : ""]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={name} className="pwrap">
                    {i > 0 && <span className={`pbar${i <= state.step ? " fill" : ""}`} />}
                    <div className={cls} aria-current={active ? "step" : undefined}>
                      <span className="pnode" />
                      <span className="plbl">{name}</span>
                    </div>
                  </div>
                );
              })}
            </nav>

            <button className="ov-close" onClick={close} aria-label="Close booking">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div className={`stage-body${state.step === 1 || state.step === 3 ? " wide" : ""}`}>
            {/* Mount steps only while open so a finished booking never leaks
                local state (ride refs, payment phase) into the next one. */}
            {state.open && renderStep(state.step, onConfirmed)}
          </div>

          {showFooter && <StageFooter />}
        </main>
      </div>
    </div>
  );
}
