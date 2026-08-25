import { SplitHeading } from "./motion";
import QuoteCard from "./booking/QuoteCard";

/** §07 — the trust row's three marks. Line icons on a 20px grid, one weight. */
const TRUST = [
  { label: "Professional Drivers", icon: <><circle cx="10" cy="6.5" r="3.2" /><path d="M3.5 17c.6-3.4 3.2-5.2 6.5-5.2s5.9 1.8 6.5 5.2" /></> },
  { label: "No Hidden Fees", icon: <><circle cx="10" cy="10" r="7" /><path d="M10 6v8M8 8.2c0-1 .9-1.6 2-1.6s2 .6 2 1.5c0 2-4 1.2-4 3.2 0 .9.9 1.5 2 1.5s2-.6 2-1.5" /></> },
  { label: "24/7 Support", icon: <><path d="M4 12v-2a6 6 0 0 1 12 0v2" /><rect x="2.5" y="11" width="3.5" height="5" rx="1.4" /><rect x="14" y="11" width="3.5" height="5" rx="1.4" /></> },
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
          <SplitHeading
            as="h1"
            className=""
            step={0.03}
            parts={[{ text: "Elevated transfers. " }, { text: "Every time.", br: true }]}
          />
          <p className="hero-sub rise">
            Reliable. Comfortable. On time.<br />
            Your journey, our priority.
          </p>
          <div className="hero-trust stagger">
            {TRUST.map((t) => (
              <span key={t.label}>
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
