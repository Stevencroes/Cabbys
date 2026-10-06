import { useState } from "react";
import { SplitHeading } from "./motion";
import { whatsappLink } from "../lib/whatsapp";
import { askAnything, SUPPORT_EMAIL } from "../lib/support";
import { MAX_SEAT_AGE } from "../lib/childSeats";
import { FREE_CANCEL_HOURS, AIRPORT_FREE_WAIT_MINUTES } from "../lib/policy";
import { CHILD_SEAT_USD, usd } from "../lib/quote";
import { MIN_NOTICE_HOURS, durationLabel } from "../lib/derivedTime";

/* Short on purpose. The owner's word, 2 Oct 2026: "keep it minimal —
   a lot of typing". This had grown to ten answers of three to five
   sentences, each saying everything that was true. Now it is the six
   questions a guest actually asks, one or two sentences each — six at
   the owner's word, 5 Oct 2026. "Do I need an account?" was the one cut:
   the cancel answer already names My trips, and the booking flow never
   asks for one, so no guest meets the worry it answered. The detail
   still lives where it is used: waiting at an address, short notice, the
   ride home and changes are all handled in the booking flow, in the
   emails and on WhatsApp.

   Every number reads its constant, and nothing here may promise what the
   product does not do. Landing.test pins both. */
const ITEMS = [
  {
    q: "What if my flight is delayed?",
    a: `Your driver goes by when you actually land and waits up to ${AIRPORT_FREE_WAIT_MINUTES} minutes, free. A late flight never costs extra.`,
  },
  {
    q: "How do I find my driver?",
    a: "They wait in the arrivals hall with a sign with your name. We email you their name, car and plate once they're assigned.",
  },
  {
    q: "How do I pay?",
    a: "In cash to your driver, in US dollars or florins. Tips are up to you.",
  },
  {
    q: "Can I cancel?",
    a: `Yes, for free, in My trips or by messaging us. Please let us know at least ${FREE_CANCEL_HOURS} hours ahead.`,
  },
  {
    q: "Are child seats available?",
    a: `Yes, for children up to ${MAX_SEAT_AGE}: ${usd(CHILD_SEAT_USD)} per seat each way. Add them when you book.`,
  },
  {
    q: "How far ahead should I book?",
    a: `At least ${durationLabel(MIN_NOTICE_HOURS * 60)} before pickup.`,
  },
];

export default function Faq() {
  // One at a time: opening a question closes whichever was open, so the
  // section never grows into a wall of prose. -1 is "all closed".
  const [open, setOpen] = useState(0);
  const wa = whatsappLink(askAnything());
  return (
    <section id="faq">
      <div className="faq flow">
        <div className="inner">
          {/* Said as a host would: what the guest might wonder is already
              handled. "The honest answers / What you're actually worried
              about" implied answers elsewhere were not honest, and named a
              worry before the guest had one. */}
          <div className="eyebrow rise" style={{ color: "var(--silver)" }}>Good to know</div>
          <SplitHeading
            className="sec"
            parts={[{ text: "A few things, already " }, { text: "taken care of.", em: true }]}
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
            Have another question?{" "}
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
