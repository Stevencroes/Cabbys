import { useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useAuth } from "../../../booking/useAuth";
import { useFare } from "../../../booking/useFare";
import { buildRidePayload } from "../../../lib/bookingPayload";
import { supabase } from "../../../lib/supabase";
import { formatMoney } from "../../../lib/currency";

export interface ConfirmedBooking {
  rideId: string;
  from: string;
  to: string;
  date: string;
  time: string;
  vehicle: string | null;
  total: number;
}

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export default function StepConfirm({ onConfirmed }: { onConfirmed?: (b: ConfirmedBooking) => void }) {
  const { state } = useBooking();
  const { user, loading: authLoading, signInWithProvider, signInWithEmail } = useAuth();
  const { base, total, loading } = useFare();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmail() {
    if (!email.trim()) return;
    setSending(true);
    await signInWithEmail(email.trim());
    setSending(false);
    setSent(true);
  }

  async function handleConfirm() {
    if (!user) return;
    setBusy(true);
    setError(null);
    const payloadState = {
      from: state.from,
      to: state.to,
      date: state.date,
      time: state.time,
      passengers: state.passengers,
      luggage: state.luggage,
      vehicle: state.vehicle,
      fareBase: base,
      fareTotal: total,
      addonKeys: [] as string[],
    };
    const { withCoords, core } = buildRidePayload(payloadState, user.id);
    let { data, error: err } = await supabase.from("rides").insert(withCoords).select().single();
    if (err) ({ data, error: err } = await supabase.from("rides").insert(core).select().single());
    if (err || !data) {
      setError(err?.message ?? "Something went wrong. Please try again.");
      setBusy(false);
      return;
    }
    onConfirmed?.({
      rideId: data.id,
      from: state.from,
      to: state.to,
      date: state.date,
      time: state.time,
      vehicle: state.vehicle,
      total,
    });
    setBusy(false);
  }

  if (authLoading) {
    return (
      <div>
        <div className="step-eyebrow">Confirm</div>
        <h2 className="step-title">Almost there.</h2>
        <p className="step-desc" style={{ color: "var(--silver-dim)" }}>Checking sign-in status…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <div className="step-eyebrow">Confirm</div>
        <h2 className="step-title">Hold this under your name.</h2>
        <p className="step-desc">
          Continue with Google or Apple to keep your trip, your receipt, and any changes in one place.
        </p>
        <div className="oauth">
          <button className="oauth-btn google" type="button" onClick={() => signInWithProvider("google")}>
            <svg width="19" height="19" viewBox="0 0 24 24">
              <path
                fill="#fff"
                d="M21.35 11.1H12v2.9h5.35c-.25 1.36-1.6 4-5.35 4a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.71 3.45 1.32l2.35-2.27C16.46 3.9 14.43 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-2.1Z"
              />
            </svg>
            Continue with Google
          </button>
          <button className="oauth-btn apple" type="button" onClick={() => signInWithProvider("apple")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <path d="M16.36 12.62c.03 2.9 2.55 3.86 2.58 3.87-.02.07-.4 1.38-1.33 2.73-.8 1.17-1.64 2.33-2.96 2.35-1.3.03-1.72-.77-3.2-.77-1.5 0-1.95.75-3.18.8-1.27.05-2.24-1.27-3.05-2.43-1.65-2.4-2.92-6.77-1.22-9.73.84-1.47 2.35-2.4 3.99-2.43 1.25-.02 2.43.84 3.2.84.76 0 2.2-1.04 3.7-.89.63.03 2.4.26 3.54 1.92-.09.06-2.11 1.24-2.08 3.7M14 5.4c.68-.82 1.13-1.96 1-3.1-.97.04-2.15.65-2.85 1.47-.63.72-1.18 1.88-1.03 2.99 1.08.08 2.19-.55 2.88-1.36" />
            </svg>
            Continue with Apple
          </button>
        </div>
        <div className="or-rule">or by email</div>
        {sent ? (
          <p className="step-desc" style={{ textAlign: "center", marginTop: 0 }}>
            Check your inbox — a sign-in link is on its way to <strong>{email}</strong>.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              className="txt"
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmail()}
            />
            <button className="btn-primary" type="button" onClick={handleEmail} disabled={!email.trim() || sending}>
              {sending ? "Sending…" : "Continue with email"}
            </button>
          </div>
        )}
        <p className="acct-note">
          We use your account only to manage this booking and send your confirmation. No marketing, no noise.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="step-eyebrow">Confirm</div>
      <h2 className="step-title">Confirm your ride.</h2>
      <p className="step-desc">
        Signed in as <strong>{user.email}</strong>. Review and confirm — your card will not be charged today.
      </p>
      <div className="pay-summary">
        <div className="ps-row">
          <span className="ps-l">Route</span>
          <span className="ps-r">{state.from || "—"} → {state.to || "—"}</span>
        </div>
        <div className="ps-row">
          <span className="ps-l">When</span>
          <span className="ps-r">{state.time || "—"}</span>
        </div>
        <div className="ps-row">
          <span className="ps-l">Passengers</span>
          <span className="ps-r">{state.passengers}</span>
        </div>
        <div className="ps-row ps-total">
          <span className="ps-l">Total fare</span>
          <span className="ps-r ps-amount">{loading ? "…" : formatMoney(total, "USD")}</span>
        </div>
      </div>
      {!STRIPE_KEY && (
        <div className="pay-card">
          <div className="pay-reserve-badge">Reserve now, pay on the day</div>
          <p className="pay-secure">
            No charge today. Your driver will confirm your booking and collect payment on the day of your transfer. Fixed fare — the price you see is the price you pay.
          </p>
        </div>
      )}
      {error && (
        <div className="pay-error" role="alert">
          {error}
        </div>
      )}
      <button
        className="btn-primary pay-confirm"
        onClick={handleConfirm}
        disabled={busy || loading}
        style={{ marginTop: "28px", width: "100%", justifyContent: "center" }}
      >
        {busy ? "Confirming…" : <>Confirm <span className="arr">→</span></>}
      </button>
    </div>
  );
}
