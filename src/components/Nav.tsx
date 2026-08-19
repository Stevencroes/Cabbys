import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useBookingOptional } from "../booking/BookingContext";
import { useAuth } from "../booking/useAuth";
import { displayNameOf, initialsOf } from "../lib/displayName";
import { lockBody, unlockBody } from "../lib/bodyLock";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Fleet", href: "/#fleet" },
  { label: "FAQ", href: "/#faq" },
  { label: "My trips", href: "/trips" },
];

export default function Nav({ onSignIn }: { onSignIn: () => void }) {
  const booking = useBookingOptional();
  // `account`, not `user`: booking as a guest mints an anonymous session, and
  // a receipt is not an identity — that must still read as signed out.
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function closeMenu() {
    setMenu(false);
    avatarRef.current?.focus();
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

  // The account menu is a dropdown, not a dialog: Escape and a click anywhere
  // else put it away, and it never traps focus or locks the page behind it.
  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
    }
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || avatarRef.current?.contains(t)) return;
      setMenu(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menu]);

  // The session can end from another tab; a menu about an account that is
  // gone should not stay on screen.
  useEffect(() => { if (!account) setMenu(false); }, [account]);

  const email = account?.email;
  const name = displayNameOf(account);

  async function handleSignOut() {
    setMenu(false);
    setOpen(false);
    await signOut();
  }

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
              /* The address is an account detail, not a name — it belongs in
                 the menu, not across the middle of the bar. */
              <div className="nacct-wrap">
                <button
                  ref={avatarRef}
                  type="button"
                  className={`navatar${menu ? " on" : ""}`}
                  onClick={() => setMenu((m) => !m)}
                  aria-expanded={menu}
                  aria-controls="nav-account"
                  aria-label={`Account — ${name}`}
                >
                  <span aria-hidden="true">{initialsOf(account)}</span>
                </button>

                {menu && (
                  <div className="nmenu" id="nav-account" ref={menuRef}>
                    <div className="nm-who">
                      <span className="nm-name">{name}</span>
                      {email && <span className="nm-mail">{email}</span>}
                    </div>
                    <Link to="/trips" onClick={() => setMenu(false)}>My trips</Link>
                    <Link to="/profile" onClick={() => setMenu(false)}>Profile</Link>
                    <button type="button" className="nm-out" onClick={handleSignOut}>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
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
            {account && (
              <div className="sheet-who">
                <span className="sheet-av" aria-hidden="true">{initialsOf(account)}</span>
                <span className="sheet-id">
                  <span className="nm-name">{name}</span>
                  {email && <span className="nm-mail">{email}</span>}
                </span>
              </div>
            )}
            {LINKS.map((l) => (
              <Link key={l.href} to={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            {account && (
              <Link to="/profile" onClick={() => setOpen(false)}>Profile</Link>
            )}
            {account ? (
              <button type="button" className="sheet-out" onClick={handleSignOut}>Sign out</button>
            ) : (
              <button type="button" onClick={() => { setOpen(false); onSignIn(); }}>Sign in</button>
            )}
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
