// Where every link in a Cabby's account email lands.
//
// The Supabase email templates (docs/email-templates/) link here, on
// cabbystransfer.com, with a one-time token_hash, instead of to Supabase's
// own /auth/v1/verify address. Two faults that fixes:
//
//  · The link in a Cabby's email pointed at a supabase.co address. Spam
//    filters read a link whose domain is not the sender's as a sign of
//    phishing, and a guest hovering over it saw someone else's name. The
//    password reset landed in spam on its first real send.
//  · Supabase's verify link spends its token on a plain GET, so a mail
//    scanner that opens links to check them (Outlook's does) uses up the
//    guest's link before they ever click it. Here the token is spent by
//    verifyOtp, which runs in the page, not by loading the URL.
//
// A spent or expired link is said so, with the way to get a new one. It
// is never a blank screen or a silent bounce to the home page.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { useAuthModal } from "../components/auth/AuthModal";

/** The types the templates send, and the only ones this page will spend. */
const TYPES: readonly EmailOtpType[] = ["signup", "email", "magiclink", "recovery", "invite", "email_change"];

/** Where each kind of link goes once it has worked, unless it names somewhere. */
const LANDING: Partial<Record<EmailOtpType, string>> = {
  recovery: "/reset-password",
  email_change: "/profile",
};

/**
 * Only a path on this site. `next` arrives in a URL anybody can edit, and
 * "//evil.example" or "https://…" would turn a sign-in link into a
 * redirect to somewhere else with the guest freshly signed in.
 */
export function safeNext(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

const HEADINGS: Partial<Record<EmailOtpType, string>> = {
  recovery: "Reset your password",
  email_change: "Confirm your new email",
  signup: "Confirm your email",
  invite: "Accept your invitation",
};

export default function AuthConfirm() {
  const navigate = useNavigate();
  const { openAuth } = useAuthModal();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const tokenHash = params.get("token_hash");
  const rawType = params.get("type");
  const type = TYPES.includes(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;

  useEffect(() => {
    // React's development double-run would spend the token twice, and the
    // second attempt would report the link as used.
    if (started.current) return;
    started.current = true;

    if (!tokenHash || !type) {
      setError("This link is incomplete. Open it straight from the email, or ask for a new one.");
      return;
    }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: err }) => {
      if (err) {
        setError(
          /expired|invalid|not found|already/i.test(err.message)
            ? "This link has expired or has already been used. Links work once, for one hour."
            : `We couldn't sign you in with this link: ${err.message}`,
        );
        return;
      }
      navigate(safeNext(params.get("next"), LANDING[type] ?? "/"), { replace: true });
    });
  }, [navigate, params, tokenHash, type]);

  return (
    <>
      <Nav onSignIn={openAuth} />
      <main className="tp-main">
        <div className="wrap tp-wrap" style={{ maxWidth: 460 }}>
          <h1 className="tp-title">{(type && HEADINGS[type]) ?? "Signing you in"}</h1>
          {error ? (
            <div className="tp-empty">
              <p role="alert">{error}</p>
              <button type="button" className="tp-link" onClick={openAuth}>Ask for a new link</button>
            </div>
          ) : (
            <p className="tp-quiet" role="status">Checking your link…</p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
