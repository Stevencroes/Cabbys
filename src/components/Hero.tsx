import { SplitHeading } from "./motion";
import QuoteCard from "./booking/QuoteCard";

/** §07 — the trust row's three marks. Line icons on a 20px grid, one weight. */
const TRUST = [
  { label: "Private, never shared", icon: <><circle cx="10" cy="6.5" r="3.2" /><path d="M3.5 17c.6-3.4 3.2-5.2 6.5-5.2s5.9 1.8 6.5 5.2" /></> },
  { label: "Fixed price", icon: <><circle cx="10" cy="10" r="7" /><path d="M10 6v8M8 8.2c0-1 .9-1.6 2-1.6s2 .6 2 1.5c0 2-4 1.2-4 3.2 0 .9.9 1.5 2 1.5s2-.6 2-1.5" /></> },
  { label: "Flight tracked", icon: <><circle cx="10" cy="10" r="7.2" /><path d="M10 5.8V10l2.8 1.7" /></> },
];

export default function Hero() {
  return (
    <header className="hero" id="top">
      {/* The photograph is the hero's ground, not an element inside it: the
          copy and the booking card sit over it, and it fades into the navy
          rather than ending on an edge. */}
      <div className="hero-photo" aria-hidden="true" />

      <div className="hero-grid">
        <div className="hero-copy">
          <div className="hero-eyebrow rise">
            <span className="eyebrow">Private transfers in Aruba</span>
          </div>
          {/* The LCP element. It starts 120ms in — behind the eyebrow, as
              the staging asks — and its words are 45ms apart, so the whole
              line has landed inside ~600ms. Nothing waits on it and it
              waits on nothing: see the .hero stage block in globals.css. */}
          <SplitHeading
            as="h1"
            className=""
            step={0.045}
            delay={0.12}
            parts={[{ text: "Your ride is ready " }, { text: "when you are.", br: true }]}
          />
          <p className="hero-sub rise">
            From the airport to your hotel, villa, or anywhere on the island — at a fixed price.
          </p>
          {/* --i is the mark's place in the queue; CSS turns it into the
              offset. Written here rather than by the reveal observer,
              which the hero deliberately opts out of. */}
          <div className="hero-trust stagger">
            {TRUST.map((t, i) => (
              <span key={t.label} style={{ "--i": i } as React.CSSProperties}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {t.icon}
                </svg>
                {t.label}
              </span>
            ))}
          </div>
        </div>

        <QuoteCard />
      </div>
    </header>
  );
}
