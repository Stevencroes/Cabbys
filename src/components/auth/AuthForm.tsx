import { useId, useState } from "react";
import { PASSWORD_MIN, authMessage, isAlreadyRegistered, useAuth } from "../../booking/useAuth";

type Mode = "signin" | "signup" | "forgot";

interface AuthFormProps {
  /** Called once the user is authenticated (sign-in succeeded). */
  onSuccess?: () => void;
  /** Heading shown above the Google button. */
  heading?: string;
  /** Compact spacing for use inside the booking flow. */
  compact?: boolean;
  /** Where Google OAuth should return to. Omit for the default (passenger "/"). */
  oauthNext?: string;
}

/** Deliberately permissive — the server is the authority on deliverability. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const HEADINGS: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create an account",
  forgot: "Reset your password",
};

/**
 * Email + password sign-in / account creation, plus Google.
 * Accounts live in the shared Supabase project, so a passenger who signs
 * up in the Cabby's mobile app can sign in here with the same credentials.
 *
 * Every failure has somewhere to land: field problems sit under their own
 * control, everything else sits above the button in one alert. Nothing here
 * fails silently, and the button is inert while a request is in flight.
 */
export default function AuthForm({ onSuccess, heading, compact, oauthNext }: AuthFormProps) {
  const { signInWithProvider, signInWithPassword, signUpWithPassword, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const uid = useId();
  const emailId = `${uid}-email`;
  const pwId = `${uid}-password`;

  const needsPassword = mode !== "forgot";

  function clearMessages() {
    setError(null);
    setEmailError(null);
    setPwError(null);
    setNotice(null);
  }

  function go(next: Mode) {
    setMode(next);
    clearMessages();
  }

  /** Client-side gate. Returns true when it's worth calling Supabase. */
  function check(mail: string): boolean {
    let ok = true;
    if (!EMAIL_RE.test(mail)) {
      setEmailError("Enter the email address you'd like us to use.");
      ok = false;
    }
    if (needsPassword && !password) {
      setPwError("Enter your password.");
      ok = false;
    } else if (mode === "signup" && password.length < PASSWORD_MIN) {
      setPwError(`Use at least ${PASSWORD_MIN} characters.`);
      ok = false;
    }
    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // a double-tap on a slow connection must not double-fire
    const mail = email.trim();
    clearMessages();
    if (!check(mail)) return;
    setBusy(true);

    if (mode === "forgot") {
      const { error: err } = await resetPassword(mail);
      // Whether or not that address has an account is not ours to disclose,
      // so the answer reads the same either way.
      if (err && !/rate limit/i.test(err.message)) setError(authMessage(err));
      else setNotice(`If ${mail} has an account, a reset link is on its way.`);
    } else if (mode === "signin") {
      const { error: err } = await signInWithPassword(mail, password);
      if (err) setError(authMessage(err));
      else onSuccess?.();
    } else {
      const { data, error: err } = await signUpWithPassword(mail, password);
      if (err && isAlreadyRegistered(err)) {
        // Not an error so much as a wrong turn: same email, other door.
        setMode("signin");
        setNotice("That email already has an account — sign in instead.");
      } else if (err) {
        setError(authMessage(err));
      } else if (data.session) {
        // Email confirmation disabled — the user is signed in already.
        onSuccess?.();
      } else {
        // Confirmation is switched on after all; say so rather than hang.
        setMode("signin");
        setNotice(`Account created. Confirm it from the mail we sent ${mail}, then sign in.`);
      }
    }
    setBusy(false);
  }

  const submitLabel = busy
    ? "Please wait…"
    : mode === "signin"
    ? "Sign in"
    : mode === "signup"
    ? "Create account"
    : "Send reset link";

  return (
    <div className={compact ? "authform compact" : "authform"}>
      <div className="ride-auth-h">{heading ?? HEADINGS[mode]}</div>

      {mode !== "forgot" && (
        <>
          <div className="oauth">
            <button className="oauth-btn google" type="button" onClick={() => signInWithProvider("google", oauthNext)}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.25 1.36-1.6 4-5.35 4a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.71 3.45 1.32l2.35-2.27C16.46 3.9 14.43 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-2.1Z" />
              </svg>
              Continue with Google
            </button>
          </div>
          <div className="auth-or" aria-hidden="true"><span>or</span></div>
        </>
      )}

      {mode === "forgot" && (
        <p className="auth-sub" style={{ textAlign: "left" }}>
          Give us the address on the account and we'll send a link to set a new password.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        <label className="sr-only" htmlFor={emailId}>Email</label>
        <input
          id={emailId}
          className={`txt${emailError ? " invalid" : ""}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          aria-invalid={!!emailError || undefined}
          aria-describedby={emailError ? `${emailId}-err` : undefined}
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
        />
        {emailError && <p className="ferr" id={`${emailId}-err`} role="alert">{emailError}</p>}

        {needsPassword && (
          <>
            <label className="sr-only" htmlFor={pwId}>Password</label>
            <div className="auth-pw">
              <input
                id={pwId}
                className={`txt${pwError ? " invalid" : ""}`}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? `Password — ${PASSWORD_MIN} characters or more` : "Password"}
                minLength={mode === "signup" ? PASSWORD_MIN : undefined}
                aria-invalid={!!pwError || undefined}
                aria-describedby={pwError ? `${pwId}-err` : undefined}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (pwError) setPwError(null); }}
              />
              <button
                className="auth-pw-toggle"
                type="button"
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {pwError && <p className="ferr" id={`${pwId}-err`} role="alert">{pwError}</p>}
          </>
        )}

        {error && <p className="auth-err" role="alert">{error}</p>}

        <button className="btn-ghost" type="submit" disabled={busy} aria-busy={busy || undefined}>
          {submitLabel}
        </button>
      </form>

      {notice && <p className="acct-note" role="status" style={{ textAlign: "left" }}>{notice}</p>}

      {mode === "signin" && (
        <button className="auth-toggle quiet" type="button" onClick={() => go("forgot")}>
          Forgot your password?
        </button>
      )}

      <button
        className="auth-toggle"
        type="button"
        onClick={() => go(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
      </button>
    </div>
  );
}
