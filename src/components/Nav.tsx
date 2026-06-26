import { useEffect, useRef } from "react";
import Diamond from "./Diamond";

export default function Nav({ onSignIn }: { onSignIn: () => void }) {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (headerRef.current) {
        headerRef.current.classList.toggle("scrolled", window.scrollY > 12);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="nav" ref={headerRef}>
      <div className="wrap navrow">
        <div className="brand">
          <div className="mark">
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id="mg" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#EEF2F8" />
                  <stop offset="1" stopColor="#7E94B4" />
                </linearGradient>
              </defs>
              <path d="M32 13.76 A 13 13 0 1 0 32 34.24" stroke="url(#mg)" strokeWidth="3.2" strokeLinecap="round" />
              <circle cx="32" cy="34.24" r="3" fill="var(--accent)" />
            </svg>
          </div>
          <div className="wordmark">
            <span className="name">Cabby's</span>
            <span className="tag"><Diamond />&nbsp;Aruba</span>
          </div>
        </div>
        <nav className="navlinks">
          <a href="#ethos" className="desk">The service</a>
          <a href="#fleet" className="desk">Fleet</a>
          <a href="/trips" className="desk">My trips</a>
          <button className="btn-ghost" onClick={onSignIn}>Sign in</button>
        </nav>
      </div>
    </header>
  );
}
