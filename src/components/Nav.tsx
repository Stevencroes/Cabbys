import { useRef, useState } from "react";

const LINKS = [
  { label: "The service", href: "#ethos" },
  { label: "Fleet", href: "#fleet" },
  { label: "My trips", href: "/trips" },
];

export default function Nav({ onSignIn }: { onSignIn: () => void }) {
  const navRef = useRef<HTMLElement>(null);
  const [hl, setHl] = useState({ left: 0, width: 0, opacity: 0 });
  const [menuOpen, setMenuOpen] = useState(false);

  // Slide the steel highlight under the hovered item.
  function moveHighlight(e: React.MouseEvent<HTMLElement>) {
    const nav = navRef.current;
    if (!nav) return;
    const navBox = nav.getBoundingClientRect();
    const box = e.currentTarget.getBoundingClientRect();
    setHl({ left: box.left - navBox.left, width: box.width, opacity: 1 });
  }
  const clearHighlight = () => setHl((h) => ({ ...h, opacity: 0 }));

  return (
    <header className="float-nav">
      <div className="float-nav-inner">
        <div className="nav-pill">
          <a className="nav-wordmark" href="/" aria-label="Cabby's — Home">Cabby<span className="ap">'</span>s</a>
          <span className="nav-divider" aria-hidden="true" />

          <nav className="nav-links" aria-label="Main navigation" ref={navRef} onMouseLeave={clearHighlight}>
            <span
              className="nav-hl"
              aria-hidden="true"
              style={{ left: hl.left, width: hl.width, opacity: hl.opacity }}
            />
            {LINKS.map((l) => (
              <a key={l.href} className="nav-link" href={l.href} onMouseEnter={moveHighlight}>
                {l.label}
              </a>
            ))}
            <button className="nav-link nav-signin" type="button" onMouseEnter={moveHighlight} onClick={onSignIn}>
              Sign in
            </button>
          </nav>

          <button
            className={`nav-burger${menuOpen ? " open" : ""}`}
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {menuOpen ? <path d="M3 3l10 10M13 3L3 13" /> : <path d="M2 5h12M2 8h12M2 11h12" />}
            </svg>
          </button>
        </div>

        {/* mobile dropdown */}
        <div className={`nav-mobile${menuOpen ? " open" : ""}`}>
          <div className="nav-mobile-panel">
            {LINKS.map((l) => (
              <a key={l.href} className="nav-mobile-link" href={l.href} onClick={() => setMenuOpen(false)}>
                <span className="dot" aria-hidden="true" />
                {l.label}
              </a>
            ))}
            <button
              className="nav-mobile-link"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onSignIn();
              }}
            >
              <span className="dot" aria-hidden="true" />
              Sign in
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
