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
    q: "Can you pick me up from my hotel?",
    a: "Yes — anywhere on the island to anywhere else, not only the airport run. Set both ends on the card at the top of this page and the price is fixed the same way.",
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
  // One at a time: opening a question closes whichever was open, so the
  // section never grows into a wall of prose. -1 is "all closed".
  const [open, setOpen] = useState(0);
  return (
    <section id="about">
      <div className="faq flow">
        <div className="inner">
          <div className="eyebrow rise" style={{ color: "var(--silver)" }}>The honest answers</div>
          <SplitHeading
            className="sec"
            parts={[{ text: "What you're " }, { text: "actually", em: true }, { text: " worried about." }]}
          />
          <div className="flist stagger">
            {ITEMS.map((item, i) => {
              const isOpen = open === i;
              const id = `faq-a-${i}`;
              // The region needs a name or it lands in the landmark list as
              // an anonymous "region" — six of them, in a row, saying nothing.
              // The question is its name, so the button carries the id.
              const qid = `faq-q-${i}`;
              return (
                <div className={`fitem${isOpen ? " open" : ""}`} key={item.q}>
                  <button
                    type="button"
                    className="fq"
                    id={qid}
                    aria-expanded={isOpen}
                    aria-controls={id}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                  >
                    <span className="qt">{item.q}</span>
                    <span className="qi" aria-hidden="true">+</span>
                  </button>
                  {/* Three boxes, not one, because the open/close is animated
                      on grid-template-rows: .fa is the 0fr -> 1fr track,
                      .fa-in is the clip that the track squeezes, and the <p>
                      keeps its own margin inside the clip. Collapsing these
                      into one element gives the margin nothing to be inside
                      of, and a closed item keeps 22px of height. */}
                  <div className="fa" id={id} role="region" aria-labelledby={qid} aria-hidden={!isOpen}>
                    <div className="fa-in"><p>{item.a}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
