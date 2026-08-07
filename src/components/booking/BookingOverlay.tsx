// The v3 booking modal — two steps, real URLs per step (§3.10), a running
// total that sits flat at the end of the step, iOS-safe scroll lock, and a
// focus trap.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBooking } from "../../booking/BookingContext";
import Step1Ride, { type StepProblem } from "./steps/Step1Ride";
import Step2Details, { type PayPhase } from "./steps/Step2Details";
import StepFoot from "./StepFoot";
import { VEHICLES } from "../../data/vehicles";
import { loadPricing, type Pricing } from "../../lib/pricing";
import { quote, usd } from "../../lib/quote";
import { lockBody, unlockBody } from "../../lib/bodyLock";
import type { ConfirmedBooking } from "../../booking/types";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

interface BookingOverlayProps {
  onConfirmed?: (booking: ConfirmedBooking) => void;
}

export default function BookingOverlay({ onConfirmed }: BookingOverlayProps) {
  const { state, close, goTo } = useBooking();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [hint, setHint] = useState("");
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
      setHint("");
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
      if (location.hash === "#step-2") goTo(2);
      else if (location.hash === "#step-1") { goTo(1); setHint(""); }
      else close(); // the back gesture leaves the modal, not the site
    }
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [goTo, close]);

  // deep-link restore: opening /#step-1 re-enters the booking
  useEffect(() => {
    if (!state.open && location.hash === "#step-2" && wasOpen.current) goTo(2);
  }, [state.open, goTo]);

  // Escape + focus trap
  useEffect(() => {
    if (!state.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { history.back(); return; }
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
    setHint("");
  }, [state.step]);

  if (!state.open) return null;

  const vehicle = VEHICLES.find((v) => v.id === state.vehicle) ?? VEHICLES[0];
  const q = state.from && state.to && state.from.id !== state.to.id
    ? quote({ from: state.from, to: state.to, vehicle, isReturn: state.journey === "return", pricing })
    : null;

  function handlePrimary() {
    const problem = validatorRef.current?.();
    if (problem) {
      setHint(problem.message);
      problem.focus?.();
      return;
    }
    setHint("");
    if (state.step === 1) {
      history.pushState({ cb: 2 }, "", "#step-2");
      goTo(2);
    } else {
      void confirmRef.current?.();
    }
  }

  const busy = phase === "creating" || phase === "paying";
  const primaryLabel = state.step === 1
    ? "Your details"
    : phase === "paying" ? "Processing…"
    : phase === "creating" ? "Reserving…"
    : phase === "payment" ? `Pay ${q ? usd(q.totalUsd) : ""}`
    : STRIPE_KEY ? "Continue to payment" : "Reserve your car";

  const foot = (
    <StepFoot
      total={state.step === 1 ? (q ? usd(q.totalUsd) : "—") : undefined}
      meta={q ? `${q.minutes} min · ${vehicle.name}${state.journey === "return" ? " · return" : ""}` : "Route sets the fare"}
      primaryLabel={primaryLabel}
      onPrimary={handlePrimary}
      onBack={state.step === 2 ? () => history.back() : undefined}
      busy={busy}
    />
  );

  return (
    <div className="book open" role="dialog" aria-modal="true" aria-label="Book your transfer" ref={bookRef}>
      <div className="bhead">
        <div className="wrap">
          <span className="brand">Cabby<span className="ap">'</span>s</span>
          <button type="button" className="bclose" aria-label="Close" onClick={() => history.back()}>✕</button>
        </div>
      </div>

      <div className="bsteps">
        <div className="wrap">
          <div className={`pip${state.step === 1 ? " active" : " done"}`}><span className="pn">01</span><span className="pt">The ride</span></div>
          <div className={`pip${state.step === 2 ? " active" : ""}`}><span className="pn">02</span><span className="pt">Your details</span></div>
        </div>
      </div>

      {/* the running total travels with the step's own column, flat under
          the last choice — no pinned bar stealing a fifth of the viewport */}
      <div className="bbody" ref={bodyRef}>
        {state.step === 1 ? (
          <Step1Ride pricing={pricing} hint={hint} registerValidator={registerValidator} foot={foot} />
        ) : (
          <Step2Details
            pricing={pricing}
            hint={hint}
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
