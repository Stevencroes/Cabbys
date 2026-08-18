import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useBookingOptional } from "../booking/BookingContext";
import { useAuth } from "../booking/useAuth";
import { lockBody, unlockBody } from "../lib/bodyLock";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Fleet", href: "/#fleet" },
  { label: "FAQ", href: "/#faq" },
  { label: "My trips", href: "/trips" },
];

/** The letter on the account chip. Falls back to a dot rather than a blank. */
function initialOf(email: string | undefined): string {
  const c = (email ?? "").trim().charAt(0);
  return c ? c.toUpperCase() : "·";
}

export default function Nav({ onSignIn }: { onSignIn: () => void }) {
  const booking = useBookingOptional();
  // `account`, not `user`: booking as a guest mints an anonymous session, and
  // a receipt is not an identity — that must still read as signed out.
  const { account } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // body lock + focus management while the sheet is open
  useEffect(() => {
    if (open && !locked.current) {
      locked.current = true;
      lockBody();
      panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    } else if (!open && locked.current) {
      locked.current = false;
      unlockBody();
    }
  }, [open]);
  useEffect(() => () => { if (locked.current) unlockBody(); }, []);

  // Escape closes; Tab stays inside the sheet
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const email = account?.email;
  // The modal is the account panel — it already holds the address and the
  // way out, so the chip's whole job is to say "you, signed in" and open it.
  const accountLabel = email ? `Account — signed in as ${email}` : "Sign in";

  return (
    <nav className="nav">
      <div className="wrap">
        <div className="navbar-inner">
          <Link to="/" className="brand" aria-label="Cabby's — Home">Cabby<span className="ap">'</span>s</Link>

          <div className="nlinks">
            {LINKS.map((l) => (
              <Link key={l.href} to={l.href}>{l.label}</Link>
            ))}
          </div>

          <div className="nright">
            {account ? (
              <button type="button" className="nacct" onClick={onSignIn} title={email} aria-label={accountLabel}>
                <span className="na-i" aria-hidden="true">{initialOf(email)}</span>
                <span className="na-e">{email}</span>
              </button>
            ) : (
              <button type="button" className="nsign" onClick={onSignIn}>Sign in</button>
            )}
            <button type="button" className="nbtn" onClick={() => booking?.open()}>
              Book a transfer
            </button>
            {/* below 1040px the links collapse in here — without this,
                My trips and Sign in are unreachable on a phone */}
            <button
              ref={triggerRef}
              type="button"
              className={`nburger${open ? " on" : ""}`}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="nav-sheet"
              onClick={() => setOpen((o) => !o)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {open ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <>
          <div className="nav-scrim" onClick={close} aria-hidden="true" />
          <div
            className="nav-sheet"
            id="nav-sheet"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            {LINKS.map((l) => (
              <Link key={l.href} to={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <button type="button" onClick={() => { setOpen(false); onSignIn(); }} aria-label={accountLabel}>
              {email ? <span className="sheet-acct">{email}</span> : "Sign in"}
            </button>
            <button
              type="button"
              className="sheet-cta"
              onClick={() => { setOpen(false); booking?.open(); }}
            >
              Book a transfer
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
