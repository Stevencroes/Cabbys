import { useState } from "react";
import { useAuth } from "../../booking/useAuth";

type Mode = "signin" | "signup";

interface AuthFormProps {
  /** Called once the user is authenticated (sign-in succeeded). */
  onSuccess?: () => void;
  /** Heading shown above the Google button. */
  heading?: string;
  /** Compact spacing for use inside the booking flow. */
  compact?: boolean;
}

/**
 * Email + password sign-in / account creation, plus Google.
 * Accounts live in the shared Supabase project, so a passenger who signs
 * up in the Cabby's mobile app can sign in here with the same credentials.
 */
export default function AuthForm({ onSuccess, heading = "Sign in", compact }: AuthFormProps) {
  const { signInWithProvider, signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail || !password) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      const { error: err } = await signInWithPassword(mail, password);
      if (err) setError(err.message);
      else onSuccess?.();
    } else {
      const { data, error: err } = await signUpWithPassword(mail, password);
      if (err) {
        setError(err.message);
      } else if (data.session) {
        // Email confirmation disabled — user is signed in immediately.
        onSuccess?.();
      } else {
        // Confirmation required — surface a clear next step.
        setNotice(`Account created. Check ${mail} to confirm, then sign in.`);
        setMode("signin");
      }
    }
    setBusy(false);
  }

  return (
    <div className={compact ? "authform compact" : "authform"}>
      <div className="ride-auth-h">{heading}</div>

      <div className="oauth">
        <button className="oauth-btn google" type="button" onClick={() => signInWithProvider("google")}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.25 1.36-1.6 4-5.35 4a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.71 3.45 1.32l2.35-2.27C16.46 3.9 14.43 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-2.1Z" />
          </svg>
          Continue with Google
        </button>
      </div>

      <div className="auth-or" aria-hidden="true"><span>or</span></div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        <input
          className="txt"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="txt"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-ghost" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      {error && (
        <p className="acct-note" style={{ color: "var(--danger, #e88)", textAlign: "left" }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="acct-note" style={{ textAlign: "left" }}>
          {notice}
        </p>
      )}

      <button
        className="auth-toggle"
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
          setNotice(null);
        }}
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
