import { Reveal, RevealGroup, RevealItem } from "./Reveal";

const STEPS = [
  {
    n: "01",
    title: "Enter your destination",
    body: "Type where you're headed — a resort, a beach, an address. Pickup defaults to the airport; change it in a tap.",
  },
  {
    n: "02",
    title: "Confirm your fixed fare",
    body: "See the full price in advance — government tax included, nothing added at the door. No meters, no surge.",
  },
  {
    n: "03",
    title: "Arrive in silence",
    body: "Your driver is waiting as you clear the doors. Settle in, and let the island come to you.",
  },
];

export default function HowItWorks() {
  return (
    <section className="howit" id="how">
      <div className="wrap">
        <Reveal>
          <div className="section-label">How a transfer works</div>
        </Reveal>
        <RevealGroup className="howit-grid">
          {STEPS.map((s) => (
            <RevealItem className="howit-step" key={s.n}>
              <div className="howit-n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
