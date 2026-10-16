// Where an applicant is: account, details, documents, approval.
//
// Four steps a driver goes through once, shown on every screen of the
// application so "how much more of this is there?" always has an answer.
// The order is real — each step needs the one before — which is why it is
// numbered. Done steps carry a tick as well as a colour, so the state
// never rests on colour alone.

const STEPS = ["Account", "Your details", "Documents", "Approval"] as const;

export default function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="drv-steps" aria-label="Your application">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li key={label} className={state} aria-current={state === "now" ? "step" : undefined}>
            <span className="dot" aria-hidden="true">
              {state === "done"
                ? <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
                : n}
            </span>
            <span className="lbl">
              {label}
              {state === "done" && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
