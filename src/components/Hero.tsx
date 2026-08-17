import { SplitHeading } from "./motion";
import QuoteCard from "./booking/QuoteCard";

export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-grid">
        {/* Phones get the card first, so the proposition has to travel with
            it — otherwise the page opens on a bare form. Same words the
            eyebrow and tag carry, which is why both are hidden below 980px. */}
        <div className="hero-strip">
          <span className="hs-k">Private transfers · Aruba</span>
          <span className="hs-v">Sent for you.</span>
        </div>

        <div className="hero-copy">
          <div className="hero-eyebrow rise">
            <span className="eyebrow">Private transfers · Aruba</span>
            <span className="l" />
          </div>
          <SplitHeading
            as="h1"
            className=""
            step={0.03}
            parts={[{ text: "Getting there was " }, { text: "always the point.", em: true }]}
          />
          <div className="hero-tag rise">
            <span className="big">Sent for you.</span>
            <span className="sm">Aruba · door to door</span>
          </div>
          <div className="hero-trust stagger">
            <span>Settled in advance</span>
            <span>Met at the gate</span>
            <span>On your hour</span>
          </div>
        </div>

        <QuoteCard />
      </div>
    </header>
  );
}
