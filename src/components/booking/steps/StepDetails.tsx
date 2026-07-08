import { useEffect, useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useAuth } from "../../../booking/useAuth";
import { isValidPhone, isValidEmail } from "../../../lib/contact";
import { isAirportTransfer, isValidFlightNumber } from "../../../lib/flight";
import AuthForm from "../../auth/AuthForm";

export default function StepDetails() {
  const { state, setField } = useBooking();
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [touched, setTouched] = useState<{ [k: string]: boolean }>({});

  const airport = isAirportTransfer(state.from, state.to);

  // Returning users get their email prefilled — never re-typed.
  useEffect(() => {
    if (user?.email && !state.contactEmail) {
      setField("contactEmail", user.email);
    }
  }, [user, state.contactEmail, setField]);

  const nameError =
    touched.name && state.contactName.trim().length < 2 ? "Please add the lead passenger's name." : null;
  const phoneError =
    touched.phone && !isValidPhone(state.contactPhone)
      ? "Enter a WhatsApp-reachable number, with country code."
      : null;
  const emailError =
    touched.email && state.contactEmail && !isValidEmail(state.contactEmail)
      ? "That email doesn't look right."
      : null;
  const flightError =
    touched.flight && state.flightNumber && !isValidFlightNumber(state.flightNumber)
      ? "Flight numbers look like AA 1234."
      : null;

  const mark = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  return (
    <div>
      <div className="step-eyebrow">Almost there</div>
      <h2 className="step-title">Who's travelling?</h2>
      <p className="step-desc">
        No account needed — just how we reach you on the day. Your driver confirms on WhatsApp.
      </p>

      <div className="dt-form">
        <div className="dt-field">
          <label className="dt-label" htmlFor="dt-name">Lead passenger</label>
          <input
            id="dt-name"
            className="txt"
            type="text"
            autoComplete="name"
            placeholder="Full name"
            value={state.contactName}
            onChange={(e) => setField("contactName", e.target.value)}
            onBlur={() => mark("name")}
            aria-invalid={!!nameError}
          />
          {nameError && <p className="dt-error" role="alert">{nameError}</p>}
        </div>

        <div className="field-pair">
          <div className="dt-field">
            <label className="dt-label" htmlFor="dt-phone">WhatsApp number</label>
            <input
              id="dt-phone"
              className="txt"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 555 000 0000"
              value={state.contactPhone}
              onChange={(e) => setField("contactPhone", e.target.value)}
              onBlur={() => mark("phone")}
              aria-invalid={!!phoneError}
            />
            {phoneError && <p className="dt-error" role="alert">{phoneError}</p>}
          </div>
          <div className="dt-field">
            <label className="dt-label" htmlFor="dt-email">Email <span className="dt-opt">optional</span></label>
            <input
              id="dt-email"
              className="txt"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="For your receipt"
              value={state.contactEmail}
              onChange={(e) => setField("contactEmail", e.target.value)}
              onBlur={() => mark("email")}
              aria-invalid={!!emailError}
            />
            {emailError && <p className="dt-error" role="alert">{emailError}</p>}
          </div>
        </div>

        {airport && (
          <div className="dt-field dt-flight">
            <label className="dt-label" htmlFor="dt-flight">
              Flight number <span className="dt-opt">optional</span>
            </label>
            <input
              id="dt-flight"
              className="txt"
              type="text"
              autoCapitalize="characters"
              placeholder="e.g. AA 1234"
              value={state.flightNumber}
              onChange={(e) => setField("flightNumber", e.target.value)}
              onBlur={() => mark("flight")}
              aria-invalid={!!flightError}
            />
            {flightError ? (
              <p className="dt-error" role="alert">{flightError}</p>
            ) : (
              <p className="dt-hint">
                We track your flight — if it's delayed, your driver waits. No extra charge.
              </p>
            )}
          </div>
        )}

        <div className="dt-field">
          <label className="dt-label" htmlFor="dt-notes">Notes for your driver <span className="dt-opt">optional</span></label>
          <input
            id="dt-notes"
            className="txt"
            type="text"
            placeholder="Child seat, extra stop, anything we should know"
            value={state.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />
        </div>
      </div>

      <div className="dt-account">
        {user ? (
          <p className="acct-note" style={{ textAlign: "left", marginTop: 0 }}>
            Booking as <strong>{user.email}</strong> — your trip will appear under My trips.
          </p>
        ) : showAuth ? (
          <AuthForm heading="Sign in" compact onSuccess={() => setShowAuth(false)} />
        ) : (
          <button type="button" className="dt-signin-link" onClick={() => setShowAuth(true)}>
            Have a Cabby's account? Sign in to save this trip
          </button>
        )}
      </div>
    </div>
  );
}
