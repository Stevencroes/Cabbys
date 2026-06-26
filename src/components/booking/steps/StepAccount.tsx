import { useEffect, useState } from "react";
import { useAuth } from "../../../booking/useAuth";
import { useBooking } from "../../../booking/BookingContext";

export default function StepAccount() {
  const { user, loading, signInWithProvider, signInWithEmail } = useAuth();
  const { setField, state } = useBooking();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user && !state.signedIn) {
      setField("signedIn", true);
    }
  }, [user, state.signedIn, setField]);

  async function handleEmailContinue() {
    if (!email.trim()) return;
    setSending(true);
    await signInWithEmail(email.trim());
    setSending(false);
    setSent(true);
  }

  if (loading) {
    return (
      <div>
        <div className="step-eyebrow">Your details</div>
        <h2 className="step-title">Hold this under your name.</h2>
        <p className="step-desc" style={{ color: "var(--silver-dim)" }}>Checking sign-in status…</p>
      </div>
    );
  }

  if (user) {
    return (
      <div>
        <div className="step-eyebrow">Your details</div>
        <h2 className="step-title">Hold this under your name.</h2>
        <p className="step-desc">
          Signed in as <strong>{user.email}</strong>. Your trip, your receipt, and any changes are saved to your account.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="step-eyebrow">Your details</div>
      <h2 className="step-title">Hold this under your name.</h2>
      <p className="step-desc">
        Continue with Google or Apple to keep your trip, your receipt, and any changes in one place.
      </p>

      <div className="oauth">
        <button
          className="oauth-btn google"
          onClick={() => signInWithProvider("google")}
          type="button"
        >
          <svg width="19" height="19" viewBox="0 0 24 24">
            <path
              fill="#fff"
              d="M21.35 11.1H12v2.9h5.35c-.25 1.36-1.6 4-5.35 4a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.71 3.45 1.32l2.35-2.27C16.46 3.9 14.43 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-2.1Z"
            />
          </svg>
          Continue with Google
        </button>

        <button
          className="oauth-btn apple"
          onClick={() => signInWithProvider("apple")}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
            <path d="M16.36 12.62c.03 2.9 2.55 3.86 2.58 3.87-.02.07-.4 1.38-1.33 2.73-.8 1.17-1.64 2.33-2.96 2.35-1.3.03-1.72-.77-3.2-.77-1.5 0-1.95.75-3.18.8-1.27.05-2.24-1.27-3.05-2.43-1.65-2.4-2.92-6.77-1.22-9.73.84-1.47 2.35-2.4 3.99-2.43 1.25-.02 2.43.84 3.2.84.76 0 2.2-1.04 3.7-.89.63.03 2.4.26 3.54 1.92-.09.06-2.11 1.24-2.08 3.7M14 5.4c.68-.82 1.13-1.96 1-3.1-.97.04-2.15.65-2.85 1.47-.63.72-1.18 1.88-1.03 2.99 1.08.08 2.19-.55 2.88-1.36" />
          </svg>
          Continue with Apple
        </button>
      </div>

      <div className="or-rule">held securely</div>

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
            onKeyDown={(e) => e.key === "Enter" && handleEmailContinue()}
          />
          <button
            className="btn-primary"
            type="button"
            onClick={handleEmailContinue}
            disabled={!email.trim() || sending}
          >
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
