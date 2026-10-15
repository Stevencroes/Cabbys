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
const SECTION_IDS = LINKS.map((l) => l.href.slice(2));

// How long the menu takes to fold back into the pill (--dur-slow-ui). Its
// contents stay mounted, hidden from assistive tech, for that long, or they
// would vanish on the first frame and the capsule would close on nothing.
const SHEET_CLOSE_MS = 300;

export default function Nav({ onSignIn }: { onSignIn: () => void }) {
  const startBooking = useStartBooking();
  // `account`, not `user`: booking as a guest mints an anonymous session, and
  // a receipt is not an identity — that must still read as signed out.
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  // The menu's contents outlive `open` by SHEET_CLOSE_MS (see above). They
  // mount with `open` itself, not a render later, so the focus below has
  // something to land on.
  const [shown, setShown] = useState(false);
  const mounted = open || shown;
  const [menu, setMenu] = useState(false);
  // Off until measured: a page with no hero never turns it on, so the bar
  // is a pill from its first frame there and is never clear waiting on a
  // script.
  const [onHero, setOnHero] = useState(false);
  // The section being read, and the link under the pointer or focus. The
  // marker sits on the second if there is one, else the first.
  const [section, setSection] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const marked = useRef<string | null>(null);
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
  // Past it, the same element draws itself in to a floating pill with a
  // ground of its own (see .nav-pill). The switch is the hero's bottom edge
  // passing under the bar's bottom edge, read by an IntersectionObserver
  // whose root is the viewport less the bar. It replaces a scroll listener
  // that compared scrollY with offsetTop + offsetHeight - 80: a forced
  // layout read on every frame of scroll, and an 80 standing in for a bar
  // that is 70px on a desktop and 60px on a phone, so the switch landed
  // 10-20px away from the edge it was meant to mark.
  //
  // A layout effect, so the first paint on the landing page is already the
  // clear bar: measured after paint, it would draw the pill and then
  // unfold it on arrival. The account pages mount this nav with no hero
  // (#top) and keep the pill.
  useLayoutEffect(() => {
    const hero = document.getElementById("top");
    const bar = navRef.current;
    if (!hero || !bar) return;
    // Without an observer nothing would ever bring the pill back, and a
    // clear bar over the FAQ is unreadable — so no observer, no clear bar.
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

  // Which linked section is being read. A section counts once it crosses a
  // thin band a third of the way down the screen — where the eye is, not
  // where the bar is — so between two linked sections (the reviews sit
  // between the fleet and the FAQ) nothing is marked, rather than the
  // marker claiming a section you have left. Contact is the footer, which
  // is too short to ever reach that band on most screens; it counts once
  // half of it is in view instead. Only the landing page has these ids;
  // elsewhere nothing is observed and the marker only follows the pointer.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = SECTION_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const last = SECTION_IDS[SECTION_IDS.length - 1];
    const inBand = new Set<string>();
    let atFoot = false;
    const pick = () => setSection(atFoot ? last : SECTION_IDS.find((id) => inBand.has(id)) ?? null);
    const band = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inBand.add(e.target.id);
        else inBand.delete(e.target.id);
      }
      pick();
    }, { rootMargin: "-33% 0px -62% 0px" });
    const foot = new IntersectionObserver(([e]) => {
      atFoot = e.isIntersecting;
      pick();
    }, { threshold: 0.5 });
    els.forEach((el) => (el.id === last ? foot : band).observe(el));
    return () => { band.disconnect(); foot.disconnect(); };
  }, []);

  // Over the photograph nothing is being read yet, so the marker rests
  // nowhere; it still answers the pointer.
  const target = hover ?? (onHero ? null : section);

  // The marker is one element that travels between links rather than a
  // state each link draws for itself, so it is positioned from the link it
  // lands on. Written straight to the element: a re-render per hover just
  // to move a span would be work for nothing. The first appearance after
  // it has been hidden fades in where it lands; only a move between two
  // links slides, or it would sweep in from the left edge of the rail.
  useLayoutEffect(() => {
    const mark = markRef.current;
    if (!mark) return;
    function place() {
      const link = target ? linksRef.current?.querySelector<HTMLElement>(`[data-id="${target}"]`) : null;
      if (!mark || !link) { mark?.classList.remove("on"); marked.current = null; return; }
      mark.classList.toggle("no-slide", marked.current === null);
      mark.style.setProperty("--mx", `${link.offsetLeft}px`);
      mark.style.setProperty("--mw", `${link.offsetWidth}px`);
      mark.classList.add("on");
      marked.current = target;
    }
    place();
    // the links' widths are only final once Inter has loaded
    document.fonts?.ready.then(() => { if (marked.current) { marked.current = null; place(); } });
  }, [target]);

  // The menu folds back into the pill rather than vanishing: its contents
  // stay mounted until the fold has finished.
  useEffect(() => {
    if (open) { setShown(true); return; }
    const t = window.setTimeout(() => setShown(false), SHEET_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  // body lock + focus management while the sheet is open
  useEffect(() => {
    if (open && !locked.current) {
      locked.current = true;
      lockBody();
      // preventScroll: the sheet is still 0px tall on this frame, and
      // focusing into it would scroll its clipped box instead of nothing
      panelRef.current?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
    } else if (!open && locked.current) {
      locked.current = false;
      unlockBody();
    }
  }, [open]);
  useEffect(() => () => { if (locked.current) unlockBody(); }, []);

  // A closing sheet is still in the DOM; inert keeps a Tab from landing in
  // it during the fold. Set here because React 18 does not know the prop.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (open) panel.removeAttribute("inert");
    else panel.setAttribute("inert", "");
  }, [open, mounted]);

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
    <nav ref={navRef} className={`nav${onHero ? " on-hero" : ""}${open ? " is-open" : ""}`}>
      {mounted && <div className="nav-scrim" onClick={close} aria-hidden="true" />}

      {/* The pill: on the hero it is the full-width rail on the hero's own
          container, past it the same box drawn in to a capsule. The menu
          lives inside it so that on a phone the capsule itself grows into
          the menu and folds back, rather than a second panel appearing. */}
      <div className="nav-pill">
      {/* Three columns, the outer two equal, so the links sit on the
          page's centre line and not on whatever is left between the
          wordmark and the CTA. */}
      <div className="nav-inner">
      <Link to="/" className="brand" aria-label="Cabby's — Home">Cabby<span className="ap">'</span>s</Link>

      <div
        className="nlinks"
        ref={linksRef}
        onPointerLeave={() => setHover(null)}
        onBlur={(e) => { if (!linksRef.current?.contains(e.relatedTarget as Node)) setHover(null); }}
      >
        <span className="nmark" ref={markRef} aria-hidden="true" />
        {LINKS.map((l) => {
          const id = l.href.slice(2);
          return (
            <Link
              key={l.href}
              to={l.href}
              data-id={id}
              className={target === id ? "on" : undefined}
              onPointerEnter={() => setHover(id)}
              onFocus={() => setHover(id)}
            >
              {l.label}
            </Link>
          );
        })}
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
            My trips and Sign in are unreachable on a phone. Three bars that
            turn into the cross, so the toggle reads as the same control. */}
        <button
          ref={triggerRef}
          type="button"
          className={`nburger${open ? " on" : ""}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="nav-sheet"
          onClick={() => setOpen((o) => !o)}
        >
          <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
        </button>
      </div>
      </div>

      <div className="nav-drawer">
        {mounted && (
          <div
            className="nav-sheet"
            id="nav-sheet"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            // folding away: gone for assistive tech at once, gone from
            // the screen when the fold ends
            aria-hidden={open ? undefined : true}
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
        )}
      </div>
      </div>
    </nav>
  );
}
