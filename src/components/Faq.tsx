import { useState } from "react";
import { SplitHeading } from "./motion";
import { whatsappLink } from "../lib/whatsapp";
import { askAnything, SUPPORT_EMAIL } from "../lib/support";
import { FREE_CANCEL_HOURS } from "../lib/policy";

/* Four of these answers were written before the guest emails and the
   booking rules existed, and promised what neither does:
   - Delays: "sixty minutes of waiting included" and "land three hours
     late and your driver is still there" were numbers the owner never
     set. What is true is that the flight number is taken and its status
     followed (src/lib/flightStatus.ts), and that the fare was fixed at
     booking, so a late flight cannot move it.
   - Finding the driver: there is no photo and no "morning you land"
     message. The driver email goes out on assignment, and again if the
     driver changes, with name, car and plate; the phone number is kept
     out of it and appears in My trips two hours before pickup
     (api/booking-alerts.ts). The name sign is not confirmed, so it is not
     promised, and a driver is never "he".
   - Cancelling: free until FREE_CANCEL_HOURS, done by the guest in My
     trips. The fee inside that window is undecided, so this says what
     the cancel panel says — a fee may apply — and not "half". There is
     no online change; "changes are free" promised a price for something
     that is done by a person, on WhatsApp or email.
   - Child seats: the seat price lives in Supabase, not here, so "no
     extra charge" was not ours to say, and neither was a legal claim.
   Each stays near its old length, so an open answer does not reflow. */
const ITEMS = [
  {
    q: "What if my flight is delayed?",
    a: "We take your flight number when you book and follow its status, and your driver sees what we see. A late landing doesn't change the fare — it was fixed when you booked, and it stays fixed. If a delay changes your plans, message us on WhatsApp or by email.",
  },
  {
    q: "How will I find my driver at Queen Beatrix?",
    a: "Once a driver is assigned, we email you their name, car and plate — and again if your driver changes. Their phone number appears in My trips two hours before pickup. Your driver meets you inside the arrivals hall, so there's no car park to find.",
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
    a: `Cancelling is free up to ${FREE_CANCEL_HOURS} hours before pickup, and you do it yourself in My trips — no phone call, no reason needed. Inside ${FREE_CANCEL_HOURS} hours, a fee may apply. Changes aren't made online: to move a time or a place, message us on WhatsApp or by email and a person will look at it.`,
  },
  {
    q: "Are child seats available?",
    a: "Yes, up to two per booking. Add them when you choose your car and tell us the children's ages, so we bring the right seats. Need more than two? Message us before you book.",
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
          {/* Six answers and then nothing. A guest whose question is the
              seventh had no way out of the one section built for what
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
