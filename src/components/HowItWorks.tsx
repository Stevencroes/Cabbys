import { SplitHeading } from "./motion";

export default function HowItWorks() {
  return (
    <section className="band" id="how">
      <div className="wrap">
        <div className="eyebrow rise" style={{ color: "var(--silver)" }}>01 — How it works</div>
        <SplitHeading className="sec" parts={[{ text: "Three steps. " }, { text: "Then nothing.", em: true }]} />
        <div className="hgrid stagger">
          <div className="hcell">
            <div className="hn">01</div>
            <h3>Book your fare</h3>
            <p>Choose your resort, see the price, reserve. Sixty seconds, no account needed, free cancellation up to 24 hours before.</p>
          </div>
          <div className="hcell">
            <div className="hn">02</div>
            <h3>We watch your flight</h3>
            <p>Delayed, diverted or early — we track it from takeoff. Your driver adjusts and waits, and the fare doesn't move.</p>
          </div>
          <div className="hcell">
            <div className="hn">03</div>
            <h3>Walk out. Car's there.</h3>
            <p>The morning you land we send the driver, the plate and the exit. No queue, no haggling. Just the door held open.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
