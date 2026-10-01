import { useState } from "react";
import { SplitHeading } from "./motion";
import { whatsappLink } from "../lib/whatsapp";
import { askAnything, SUPPORT_EMAIL } from "../lib/support";
import { FREE_CANCEL_HOURS, AIRPORT_FREE_WAIT_MINUTES, ADDRESS_FREE_WAIT_MINUTES } from "../lib/policy";
import { CHILD_SEAT_USD, usd } from "../lib/quote";

/* 1d173f2 cut these answers back to what the product did at the time,
   and said less wherever the owner had not decided. The owner has now
   decided, so each answer says the decision — from the constant that
   holds it, so the FAQ cannot drift from the booking form or My trips:
   - Delays: the driver goes by the ACTUAL landing time, waits free for
     AIRPORT_FREE_WAIT_MINUTES after it (ADDRESS_FREE_WAIT_MINUTES at a
     hotel or address), and there are no waiting charges. After that the
     driver calls and WhatsApps, then may leave as a no-show.
   - Finding the driver: the name sign is confirmed and back. The driver
     email still goes out on assignment with name, car and plate; the
     phone number still waits for My trips, two hours before pickup. A
     driver is "they", never "he".
   - Paying: cash to the driver, dollars or florins, tips extra and
     optional. Card payment is off in production, and the payment step
     says the same.
   - Cancelling: free up to FREE_CANCEL_HOURS, and — while payment is cash
     — still free inside it, with an ask to cancel early. "A fee may
     apply" was the undecided version and is gone. There is still no
     online change; a person does it.
   - Child seats: CHILD_SEAT_USD per seat per ride, each child's age
     required. "No extra charge" was never ours to say, and is not true
     now; neither was a legal claim.
   Each stays tight: one open answer should not push the next question
   off a phone screen. */
const ITEMS = [
  {
    q: "What if my flight is delayed?",
    a: `Your driver goes by when your flight actually lands, and a late flight never costs extra. They wait up to ${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, or ${ADDRESS_FREE_WAIT_MINUTES} minutes at a hotel or other address, and there are no waiting charges. After that they call and WhatsApp you; if they still can't reach you, they may leave, and the ride counts as a no-show. Flight cancelled or moved to another day? Cancel for free, or message us and we'll move your booking to the new flight if a driver is free.`,
  },
  {
    q: "How will I find my driver at Queen Beatrix?",
    a: "Your driver waits in the arrivals hall holding a sign with your name, so there's no car park to find. Once a driver is assigned, we email you their name, car and plate — and again if your driver changes. Their phone number appears in My trips two hours before pickup.",
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
    q: "How do I pay?",
    a: "In cash, to your driver at the end of the ride — US dollars or Aruban florins. You pay the price you were quoted when you booked, nothing more. Tips aren't included and are always up to you.",
  },
  {
    q: "Can I cancel or change my booking?",
    a: `Cancelling is free up to ${FREE_CANCEL_HOURS} hours before pickup, and you do it yourself in My trips — no phone call, no reason needed. Inside ${FREE_CANCEL_HOURS} hours it's still free; just cancel as soon as you know, so a driver isn't sent for nothing. If the airline cancels your flight, cancelling is always free. Changes aren't made online: to move a time or a place, message us on WhatsApp or by email and a person will look at it.`,
  },
  {
    q: "Are child seats available?",
    a: `Yes, up to two per ride, at ${usd(CHILD_SEAT_USD)} per seat each way. Add them when you choose your car and tell us each child's age, so the seat fits. Need more than two? Message us before you book.`,
  },
];

export default function Faq() {
  // One at a time: opening a question closes whichever was open, so the
  // section never grows into a wall of prose. -1 is "all closed".
  const [open, setOpen] = useState(0);
  const wa = whatsappLink(askAnything());
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
          {/* The answers and then nothing. A guest whose question was not
              among them had no way out of the one section built for what
              they are worried about — and two of these answers (changes,
              cancellations) are the kind that produce a follow-up by
              design. Deliberately quiet: a way out for the few, not a
              second call to action arguing with the booking card. */}
          <p className="fmore">
            Still not answered?{" "}
            {wa && (
              <>
                <a href={wa} target="_blank" rel="noreferrer">Message us on WhatsApp</a>
                {" or "}
              </>
            )}
            <a href={`mailto:${SUPPORT_EMAIL}`}>email us</a> — a person answers, not a form.
          </p>
        </div>
      </div>
    </section>
  );
}
