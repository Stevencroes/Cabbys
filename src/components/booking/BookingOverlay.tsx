// The booking modal — four steps, real URLs per step (§3.10), a running
// total that sits flat at the end of the step, iOS-safe scroll lock, and a
// focus trap.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBooking, STEP_NAMES, type Step } from "../../booking/BookingContext";
import Step2Car from "./steps/Step2Car";
import Step3Details, { type PayPhase } from "./steps/Step3Details";
import { effectivePickupTime, type StepProblem } from "./steps/shared";
import StepFoot from "./StepFoot";
import { VEHICLES } from "../../data/vehicles";
import { loadPricing, type Pricing } from "../../lib/pricing";
import { quote, usd } from "../../lib/quote";
import { lockBody, unlockBody } from "../../lib/bodyLock";
import type { ConfirmedBooking } from "../../booking/types";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

/** The steps, in order. The header row, the progress fill and where the
    flow ENDS are all derived from this — so the payment step simply is not
    part of the flow when there is no key to take a card with, rather than
    being a fourth station everyone is counted towards and then denied. */
const STEPS: readonly string[] = STRIPE_KEY ? STEP_NAMES : STEP_NAMES.slice(0, -1);
const LAST = STEPS.length as Step;

/** "Step two of three" reads; "Step 2/3" is a receipt. Falls back to the
    numeral past the point where spelling it out helps anyone. */
const WORDS = ["", "one", "two", "three", "four", "five", "six"] as const;
const word = (n: number) => WORDS[n] ?? String(n);

/** #step-2 is state, not a place — but it is a real history entry, so the
    back gesture walks the steps instead of leaving the site. */
const stepFromHash = (hash: string): Step | null => {
  const n = Number(/^#step-(\d+)$/.exec(hash)?.[1]);
  return n >= 1 && n <= LAST ? (n as Step) : null;
};

interface BookingOverlayProps {
  onConfirmed?: (booking: ConfirmedBooking) => void;
}

export default function BookingOverlay({ onConfirmed }: BookingOverlayProps) {
  const { state, close, goTo } = useBooking();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [problem, setProblem] = useState<StepProblem | null>(null);
  const [phase, setPhase] = useState<PayPhase>("review");
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const validatorRef = useRef<(() => StepProblem | null) | null>(null);
  const confirmRef = useRef<(() => Promise<void>) | null>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((p) => !cancelled && setPricing(p));
    return () => { cancelled = true; };
  }, []);

  const registerValidator = useCallback((fn: () => StepProblem | null) => {
    validatorRef.current = fn;
  }, []);
  const registerConfirm = useCallback((fn: () => Promise<void>) => {
    confirmRef.current = fn;
  }, []);

  // ── §3.10 back button: each step is a real history entry ──
  useEffect(() => {
    if (state.open && !wasOpen.current) {
      wasOpen.current = true;
      lockBody();
      setProblem(null);
      setPhase("review");
      setError(null);
      history.pushState({ cb: 1 }, "", "#step-1");
    } else if (!state.open && wasOpen.current) {
      wasOpen.current = false;
      unlockBody();
      if (location.hash.startsWith("#step")) {
        history.replaceState({}, "", location.pathname + location.search);
      }
    }
  }, [state.open]);

  useEffect(() => {
    function onPop() {
      if (!wasOpen.current) return;
      const step = stepFromHash(location.hash);
      if (step) { goTo(step); setProblem(null); }
      else close(); // the back gesture leaves the modal, not the site
    }
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [goTo, close]);

  // deep-link restore: opening /#step-2 re-enters the booking there
  useEffect(() => {
    const step = stepFromHash(location.hash);
    if (!state.open && step && step > 1 && wasOpen.current) goTo(step);
  }, [state.open, goTo]);

  // Escape + focus trap
  useEffect(() => {
    if (!state.open) return;
    function onKey(e: KeyboardEvent) {
      // A date or time popover claims Escape first — closing the whole
      // booking flow because someone dismissed a calendar loses the ride.
      if (e.key === "Escape") { if (!e.defaultPrevented) history.back(); return; }
      if (e.key !== "Tab" || !bookRef.current) return;
      const focusables = bookRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.open]);

  // scroll to top on step change (scrollTo is absent in jsdom)
  useEffect(() => {
    if (bodyRef.current && typeof bodyRef.current.scrollTo === "function") {
      bodyRef.current.scrollTo(0, 0);
    }
    setProblem(null);
  }, [state.step]);

  // A message stops being true the moment its own field is filled in.
  // Validation only ever ran on submit, so "set the hour, minutes and AM/PM"
  // stayed under a time that already read back "your driver waits from 2 PM".
  // Re-run the validator as the form changes and drop the message once that
  // field clears — but never promote the NEXT field's error to the screen,
  // because nobody has tried to walk past it yet.
  useEffect(() => {
    if (!problem) return;
    const still = validatorRef.current?.();
    if (!still || still.field !== problem.field) setProblem(null);
  }, [state, problem]);

  if (!state.open) return null;

  const vehicle = VEHICLES.find((v) => v.id === state.vehicle) ?? VEHICLES[0];
  const q = state.from && state.to && state.from.id !== state.to.id
    ? quote({ from: state.from, to: state.to, vehicle, isReturn: state.journey === "return", pricing,
              pickupTime: effectivePickupTime(state) })
    : null;

  function handlePrimary() {
    const found = validatorRef.current?.();
    if (found) {
      setProblem(found);
      found.focus?.();
      return;
    }
    setProblem(null);
    if (state.step < LAST) {
      const next = (state.step + 1) as Step;
      history.pushState({ cb: next }, "", `#step-${next}`);
      goTo(next);
    } else {
      void confirmRef.current?.();
    }
  }

  const busy = phase === "creating" || phase === "paying";
  // Each label names the screen it opens, so the button is a signpost and
  // not a dare — except on the last one, where it names what it costs.
  const primaryLabel = state.step === 1
    ? "Your details"
    : state.step === 2
    ? "Review"
    : state.step === 3
    ? (STRIPE_KEY ? "Continue to payment"
       : phase === "creating" ? "Reserving…" : "Reserve your car")
    : phase === "paying" ? "Processing…"
    : phase === "creating" ? "Preparing…"
    // back at "review" on the payment step means the reservation or the
    // card field did not arrive, and the button is the way to try again
    : phase === "review" ? "Try again"
    : `Pay ${q ? usd(q.totalUsd) : ""}`;

  const foot = (
    <StepFoot
      // review and payment carry the total in the facts table beside them
      total={state.step < 3 ? (q ? usd(q.totalUsd) : "—") : undefined}
      meta={q ? `${q.minutes} min · ${vehicle.name}${state.journey === "return" ? " · return" : ""}` : "Route sets the fare"}
      primaryLabel={primaryLabel}
      onPrimary={handlePrimary}
      onBack={state.step > 1 ? () => history.back() : undefined}
      busy={busy}
    />
  );

  return (
    <div className="book open" role="dialog" aria-modal="true" aria-label="Book your transfer" ref={bookRef}>
      {/* The whole step indicator: a line that grows. Not a control, so it
          is not focusable and carries no role — the header text beside it
          says the same thing to a screen reader. */}
      <div className="bprog" aria-hidden="true">
        <span className="bprog-fill" style={{ width: `${Math.round((state.step / STEPS.length) * 100)}%` }} />
      </div>

      <div className="bhead">
        {/* full bleed for the hairline, the site rail's container for the
            contents — the wordmark must not move when the modal opens */}
        <div className="bhead-inner">
        <span className="brand">Cabby<span className="ap">'</span>s</span>
        <p className="bstep" role="status">
          Step <span className="bstep-n">{word(state.step)}</span> of {word(STEPS.length)}
          {" · "}{STEPS[state.step - 1]}
        </p>
        <button type="button" className="bclose" aria-label="Close" onClick={() => history.back()}>
          Close <span aria-hidden="true">✕</span>
        </button>
        </div>
      </div>

      {/* the running total travels with the step's own column, flat under
          the last choice — no pinned bar stealing a fifth of the viewport */}
      <div className="bbody" ref={bodyRef}>
        {state.step === 1 ? (
          <Step2Car pricing={pricing} problem={problem} registerValidator={registerValidator} foot={foot} />
        ) : (
          <Step3Details
            pricing={pricing}
            problem={problem}
            registerValidator={registerValidator}
            phase={phase}
            setPhase={setPhase}
            onConfirmed={onConfirmed}
            error={error}
            setError={setError}
            needsAuth={needsAuth}
            setNeedsAuth={setNeedsAuth}
            registerConfirm={registerConfirm}
            foot={foot}
          />
        )}
      </div>
    </div>
  );
}
