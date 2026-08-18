// Where the recovery link lands.
//
// Supabase puts the recovery grant in the URL fragment. detectSessionInUrl
// (set explicitly in lib/supabase.ts) trades it for a real session before
// getSession() resolves, so by the time this screen has an answer it either
// holds a session that may set a new password, or the link is spent.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { PASSWORD_MIN, authMessage, useAuth } from "../booking/useAuth";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { useAuthModal } from "../components/auth/AuthModal";

type Phase = "checking" | "ready" | "expired" | "saved";

/** Reads the `#error=…` fragment Supabase sends back for a spent link. */
function linkError(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.includes("error")) return null;
  const p = new URLSearchParams(hash);
  const code = p.get("error_code") ?? "";
  if (code.includes("expired")) return "That link has expired. Reset links are good for one hour.";
  return p.get("error_description")?.replace(/\+/g, " ") ?? "That link is no longer valid.";
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { openAuth } = useAuthModal();
  const { updatePassword } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromLink = linkError();
    if (fromLink) {
      setError(fromLink);
      setPhase("expired");
      return;
    }
    let live = true;
    // PASSWORD_RECOVERY can land either side of getSession resolving, so
    // both are watched and the first one that produces a session wins.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (live && event === "PASSWORD_RECOVERY" && session) setPhase("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setPhase((p) => (p === "ready" ? p : data.session ? "ready" : "expired"));
    });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two don't match.");
      return;
    }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) { setError(authMessage(err)); return; }
    setPhase("saved");
    // The recovery session is now a normal one — the traveler is signed in.
    setTimeout(() => navigate("/trips", { replace: true }), 1400);
  }

  return (
    <>
      <Nav onSignIn={openAuth} />
      <main className="tp-main">
        <div className="wrap tp-wrap" style={{ maxWidth: 460 }}>
          <h1 className="tp-title">Set a new password</h1>

          {phase === "checking" && <p className="tp-quiet">Checking your link…</p>}

          {phase === "expired" && (
            <div className="tp-empty">
              <p>{error ?? "That link is no longer valid."}</p>
              <button type="button" className="tp-link" onClick={openAuth}>Ask for a new one</button>
            </div>
          )}

          {phase === "saved" && (
            <div className="tp-empty">
              <p>Password changed. You're signed in.</p>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={save} noValidate style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              <label className="sr-only" htmlFor="rp-new">New password</label>
              <div className="auth-pw">
                <input
                  id="rp-new"
                  className={`txt${error ? " invalid" : ""}`}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={`New password — ${PASSWORD_MIN} characters or more`}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                />
                <button
                  className="auth-pw-toggle"
                  type="button"
                  aria-pressed={show}
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow((s) => !s)}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              <label className="sr-only" htmlFor="rp-confirm">Repeat new password</label>
              <input
                id="rp-confirm"
                className={`txt${error ? " invalid" : ""}`}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat it"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); if (error) setError(null); }}
              />
              {error && <p className="auth-err" role="alert">{error}</p>}
              <button className="btn-ghost" type="submit" disabled={busy} aria-busy={busy || undefined}>
                {busy ? "Saving…" : "Save password"}
              </button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
