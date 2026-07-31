import { useState } from "react";
import { SplitHeading } from "./motion";

const ITEMS = [
  {
    q: "What if my flight is delayed?",
    a: "We track it from takeoff. If you land three hours late at two in the morning, your driver is still there — and the fare doesn't change. Sixty minutes of waiting is included as standard; beyond that we simply adjust. We don't bill you for the airline's mistake.",
  },
  {
    q: "How will I find my driver at Queen Beatrix?",
    a: "The morning you land we send the driver's name, photo, phone number and licence plate. He waits inside the arrivals hall with a sign showing your name — past customs, before the exit doors. You don't need to call anyone or find a car park.",
  },
  {
    q: "Is this cheaper than an airport taxi?",
    a: "Not always, and we won't pretend otherwise. A metered taxi may come in lower on a quiet afternoon. What you're paying for is that the price cannot move, the car is booked before you land, and nobody is negotiating with you in a queue at midnight with tired children.",
  },
  {
    q: "Can I cancel or change my booking?",
    a: "Free cancellation up to 24 hours before pickup — one click, no phone call, no reason required. Inside 24 hours we charge half, because a driver has already turned down other work to hold your slot. Changes to time or destination are free whenever we can accommodate them.",
  },
  {
    q: "Are child seats available?",
    a: "Yes, and at no extra charge — just tell us ages when you book. Aruban law requires them for young children, and we'd rather bring one you don't need than arrive without one you do.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq">
      <div className="faq flow">
        <div className="inner">
          <div className="eyebrow rise" style={{ color: "var(--amber)" }}>03 — The honest answers</div>
          <SplitHeading
            className="sec"
            parts={[{ text: "What you're " }, { text: "actually", em: true }, { text: " worried about." }]}
          />
          <div className="flist stagger">
            {ITEMS.map((item, i) => (
              <div className={`fitem${open === i ? " open" : ""}`} key={item.q}>
                <button
                  type="button"
                  className="fq"
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? -1 : i)}
                >
                  <span className="qt">{item.q}</span>
                  <span className="qi" aria-hidden="true">+</span>
                </button>
                <div className="fa"><p>{item.a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
