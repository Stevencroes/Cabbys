// The running total, flat at the end of the step's own column — no pinned
// bar eating the viewport. Same numbers, same single quote() source.
interface StepFootProps {
  /** omitted on step 2, where the review card already carries the total */
  total?: string;
  meta?: string;
  primaryLabel: string;
  onPrimary: () => void;
  onBack?: () => void;
  busy: boolean;
}

export default function StepFoot({ total, meta, primaryLabel, onPrimary, onBack, busy }: StepFootProps) {
  return (
    <div className={`pfoot${total ? "" : " bare"}`}>
      {total && (
        <div className="pf-l">
          <span className="tk">Total · all in</span>
          <span className="tv">{total}</span>
          <span className="tm">{meta}</span>
        </div>
      )}
      <div className="pf-r">
        {onBack && (
          <button type="button" className="btn back" onClick={onBack} disabled={busy}>Back</button>
        )}
        <button type="button" className="btn primary" onClick={onPrimary} disabled={busy}>
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
