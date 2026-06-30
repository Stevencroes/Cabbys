import Icon from "./Icon";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";

const CARDS = [
  {
    icon: "spark" as const,
    title: "Settled in advance",
    body: "Your fare is fixed and shown in full before you confirm — government tax included, nothing added at the door. No meters, no surge, no surprise.",
  },
  {
    icon: "pin" as const,
    title: "Met at the gate",
    body: "Arriving at Queen Beatrix, your driver is waiting as you clear the doors. Direct to the Renaissance, the Ritz-Carlton, or wherever the evening leads.",
  },
  {
    icon: "clock" as const,
    title: "On your hour",
    body: "Booked to the minute and held for you. Sunset at Eagle Beach, a chef's table in Oranjestad, a flight at dawn — the car keeps your time, not the other way around.",
  },
];

export default function Ethos() {
  return (
    <section className="ethos" id="ethos">
      <div className="wrap">
        <Reveal>
          <div className="section-label">Why a quiet arrival matters</div>
        </Reveal>
        <RevealGroup className="ethos-grid">
          {CARDS.map((c) => (
            <RevealItem className="ecard" key={c.title}>
              <div className="ico">
                <Icon name={c.icon} />
              </div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
