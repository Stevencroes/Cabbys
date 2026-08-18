import { SplitHeading } from "./motion";
import QuoteCard from "./booking/QuoteCard";

export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-grid">
        {/* Copy first on every width. The card follows it here in the DOM,
            and nothing reorders them — see the 980px block in globals.css. */}
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
