import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStartBooking } from "../booking/useStartBooking";
import { useAuth } from "../booking/useAuth";
import { displayNameOf, initialsOf } from "../lib/displayName";
import { lockBody, unlockBody } from "../lib/bodyLock";

// §06 — the four the mockup names, and the step strip ahead of them. "My trips" leaves the rail: it is an
// account destination, and it now sits with the account itself on the right.
const LINKS = [
  // Each label names what it actually opens. "Services" landed on four
  // reasons to book and "About Us" on the FAQ — a company story the page
  // does not tell, which is a promise broken one click in.
  //
  // In page order, so the rail is also a table of contents. "How it works"
  // is the route (Journey.tsx), which carries the reasons to book as well;
  // "Why Cabby's" went when the pillars merged into it, rather than stay
  // as a second link to the same place. The FAQ link pointed at
  // /#about, the FAQ's old id, which promised an About section the page
  // does not have; it is /#faq now, and HashScroll still answers /#about.
  { label: "How it works", href: "/#how-it-works" },
  { label: "Vehicles", href: "/#fleet" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/#contact" },
];

export default function Nav({ onSignIn }: { onSignIn: () => void }) {
  const startBooking = useStartBooking();
  // `account`, not `user`: booking as a guest mints an anonymous session, and
  // a receipt is not an identity — that must still read as signed out.
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  // Off until measured: a page with no hero never turns it on, so the bar
  // is a surface from its first frame there and is never transparent
  // waiting on a script.
  const [onHero, setOnHero] = useState(false);
  const navRef = useRef<HTMLElement>(null);
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

  // Over the hero the rail is no bar at all — wordmark, links and the CTA
  // sit straight on the photograph, the way the reference sets its nav.
  // Past it, the rail is over moving text and needs a ground and a line
  // under it (see .nav.on-hero). The switch is the hero's bottom edge
  // passing under the bar's bottom edge, read by an IntersectionObserver
  // whose root is the viewport less the bar. It replaces a scroll listener
  // that compared scrollY with offsetTop + offsetHeight - 80: a forced
  // layout read on every frame of scroll, and an 80 standing in for a bar
  // that is 70px on a desktop and 60px on a phone, so the switch landed
  // 10-20px away from the edge it was meant to mark.
  //
  // A layout effect, so the first paint on the landing page is already the
  // clear bar: measured after paint, it would draw a solid bar and then
  // fade it out on arrival. The account pages mount this nav with no hero
  // (#top) and keep the surface.
  useLayoutEffect(() => {
    const hero = document.getElementById("top");
    const bar = navRef.current;
    if (!hero || !bar) return;
    // Without an observer nothing would ever turn the ground back on, and
    // a clear bar over the FAQ is unreadable — so no observer, no clear bar.
    if (typeof IntersectionObserver === "undefined") return;
    const clear = bar.offsetHeight;
    setOnHero(hero.getBoundingClientRect().bottom > clear);
    const io = new IntersectionObserver(
      ([entry]) => setOnHero(entry.isIntersecting),
      { rootMargin: `-${clear}px 0px 0px 0px` },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

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
    <nav ref={navRef} className={`nav${onHero ? " on-hero" : ""}`}>
      {/* The bar is full bleed so the hairline reaches both edges; its
          contents take the hero's own container, or the wordmark lands
          160px left of the headline on a wide screen. Three columns, the
          outer two equal, so the links sit on the page's centre line and
          not on whatever is left between the wordmark and the CTA. */}
      <div className="nav-inner">
      {/* A plain link, not a router <Link>: the owner wants the wordmark to
          reload the home page. As a <Link> it did nothing on the landing
          page itself — already at "/", the router swallowed the click — and
          from /#faq it changed the URL without leaving the section. A real
          navigation lands at the top of a fresh page from anywhere. */}
      <a href="/" className="brand" aria-label="Cabby's — Home">Cabby<span className="ap">'</span>s</a>

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
        <button type="button" className="nbtn" onClick={() => startBooking()}>
          Book now
        </button>
        {/* below 1100px the links collapse in here — without this,
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
            {/* My trips left the rail for the account cluster (§06). On a
                phone that cluster is this sheet, so it lands here — dropping
                it from LINKS must not put it out of reach. */}
            {account && (
              <>
                <Link to="/trips" onClick={() => setOpen(false)}>My trips</Link>
                <Link to="/profile" onClick={() => setOpen(false)}>Profile</Link>
              </>
            )}
            {account ? (
              <button type="button" className="sheet-out" onClick={handleSignOut}>Sign out</button>
            ) : (
              <button type="button" onClick={() => { setOpen(false); onSignIn(); }}>Sign in</button>
            )}
            <button
              type="button"
              className="sheet-cta"
              onClick={() => { setOpen(false); startBooking(); }}
            >
              Book now
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
