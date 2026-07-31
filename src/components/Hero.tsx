import { SplitHeading } from "./motion";
import SunGraphic from "./SunGraphic";
import QuoteCard from "./booking/QuoteCard";

export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="hero-eyebrow rise">
            <span className="eyebrow">Private transfers · Aruba</span>
            <span className="l" />
          </div>
          <SplitHeading
            as="h1"
            className=""
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

      <div className="hero-sun par" data-speed="-.06" aria-hidden="true">
        <div className="sun-rise"><div className="sun-float">
          <SunGraphic />
        </div></div>
      </div>
    </header>
  );
}
