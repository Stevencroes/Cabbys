import Diamond from "./Diamond";
import EntryCard from "./EntryCard";

export default function Hero({ onBegin }: { onBegin: () => void }) {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">
            <Diamond />
            Private transfers · Aruba
          </div>
          <h1 className="hero-title">
            Arrive in<br />
            <span className="accent">silence.</span>
          </h1>
          <p className="hero-sub">
            A car waiting before you ask. A driver who knows the island. The quiet certainty of a fixed price, settled before you arrive.
          </p>
          <div className="hero-meta">
            <div className="item"><Diamond hollow /><b>Fixed</b>&nbsp;fares</div>
            <div className="sep"></div>
            <div className="item"><Diamond hollow /><b>Six</b>&nbsp;resort partners</div>
            <div className="sep"></div>
            <div className="item"><Diamond hollow />Airport&nbsp;<b>meet &amp; greet</b></div>
          </div>
        </div>
        <EntryCard onBegin={onBegin} />
      </div>
    </section>
  );
}
