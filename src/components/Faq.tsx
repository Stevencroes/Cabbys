import { useState } from "react";
import { SplitHeading } from "./motion";
import { whatsappLink } from "../lib/whatsapp";
import { askAnything, SUPPORT_EMAIL } from "../lib/support";
import { MAX_SEAT_AGE } from "../lib/childSeats";
import { FREE_CANCEL_HOURS, AIRPORT_FREE_WAIT_MINUTES, ADDRESS_FREE_WAIT_MINUTES, confirmWindowLabel } from "../lib/policy";
import { CHILD_SEAT_USD, usd } from "../lib/quote";
import { MIN_NOTICE_HOURS, LEAD_US_MIN, LEAD_INTL_MIN, durationLabel } from "../lib/derivedTime";
import { ACTIVE_LEAD_HOURS } from "../lib/tripStatus";

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
   off a phone screen.

   Three more, once the step strip (Steps.tsx) made the questions obvious,
   each answered only from what the code does:
   - How far ahead: MIN_NOTICE_HOURS. Inside it a booking is NOT refused
     (insideMinNotice only raises a notice, TripSchedule.tsx) — a person
     checks it and confirms on WhatsApp within confirmWindowLabel(), the
     same line the confirmation email and screen give.
   - An account: booking is guest-first (src/lib/rides.ts, an anonymous
     session; docs/guest-claim.sql, "Decision: booking stays guest-first").
     My trips is the one thing an account adds — MyTrips.tsx shows a
     signed-out guest nothing but a sign-in — and claim_guest_rides moves
     bookings made under the same email onto it. Cancelling there and the
     driver's number there are therefore account features, and the answer
     says so — and the cancel answer, which sent every guest to My trips,
     now tells a guest without one to message us (admin_cancel_ride is
     how a person does it).
   - Flying home: the brief for this said the guest picks a pickup time.
     They do not. With the airport as the drop-off, the card asks for the
     DEPARTURE time and collectAt() sets the pickup LEAD_US_MIN or
     LEAD_INTL_MIN before it; the drive time shows beside the price in
     the flow. Airlines set check-in, not us — so "check yours".
   The FAQ's own "two hours" (finding your driver) is read from
   ACTIVE_LEAD_HOURS now, the number canContactDriver actually uses.

   Ten questions, in the order a trip raises them — arrival first, then
   booking, paying and cancelling, then the price comparison last, as the
   one a guest who has read this far has mostly answered for themselves.
   Ten closed questions are ten one-line rows and only one opens at a
   time, so the list still reads in a glance; grouping it under headings
   would add a level of navigation to save a scroll of a few rows. */
const ITEMS = [
  {
    q: "What if my flight is delayed?",
    a: `Your driver goes by when your flight actually lands, and a late flight never costs extra. They wait up to ${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, or ${ADDRESS_FREE_WAIT_MINUTES} minutes at a hotel or other address, and there are no waiting charges. After that they call and WhatsApp you; if they still can't reach you, they may leave, and the ride counts as a no-show. Flight cancelled or moved to another day? Cancel for free, or message us and we'll move your booking to the new flight if a driver is free.`,
  },
  {
    q: "How will I find my driver at Queen Beatrix?",
    a: `Your driver waits in the arrivals hall holding a sign with your name, so there's no car park to find. Once a driver is assigned, we email you their name, car and plate — and again if your driver changes. Their phone number appears in My trips ${durationLabel(ACTIVE_LEAD_HOURS * 60)} before pickup.`,
  },
  {
    q: "How far ahead do I need to book?",
    a: `At least ${durationLabel(MIN_NOTICE_HOURS * 60)} before pickup. Closer than that, you can still book here: because it's short notice, a person checks it can be done and confirms on WhatsApp within ${confirmWindowLabel()}.`,
  },
  {
    q: "Do I need an account?",
    a: `No. You book as a guest, and your confirmation and your driver's details come by email. An account adds My trips, where you can cancel yourself and where your driver's phone number appears ${durationLabel(ACTIVE_LEAD_HOURS * 60)} before pickup. Create one with the email you booked with, and the bookings you made as a guest move onto it.`,
  },
  {
    q: "Can you pick me up from my hotel?",
    a: "Yes — anywhere on the island to anywhere else, not only the airport run. Set both ends on the card at the top of this page and the price is fixed the same way.",
  },
  {
    q: "I'm flying home — when should I book my pickup?",
    a: `You don't have to work it out. When the airport is your drop-off, the booking card asks for your flight's departure time and sets the pickup from it: ${durationLabel(LEAD_US_MIN)} before take-off for flights to the US, which clear US immigration here in Aruba, and ${durationLabel(LEAD_INTL_MIN)} for anywhere else. The drive time shows beside the price. Airlines set their own check-in times, so check yours — and if you'd like to leave earlier, message us and a person will look at it.`,
  },
  {
    q: "How do I pay?",
    a: "In cash, to your driver at the end of the ride — US dollars or Aruban florins. You pay the price you were quoted when you booked, nothing more. Tips aren't included and are always up to you.",
  },
  {
    q: "Can I cancel or change my booking?",
    a: `Cancelling is free up to ${FREE_CANCEL_HOURS} hours before pickup. With an account you do it yourself in My trips — no phone call, no reason needed; booked as a guest, message us and we'll cancel it. Inside ${FREE_CANCEL_HOURS} hours it's still free; just cancel as soon as you know, so a driver isn't sent for nothing. If the airline cancels your flight, cancelling is always free. Changes aren't made online: to move a time or a place, message us on WhatsApp or by email and a person will look at it.`,
  },
  {
    q: "Are child seats available?",
    a: `Yes, for children up to ${MAX_SEAT_AGE}: up to two per ride, at ${usd(CHILD_SEAT_USD)} per seat each way. Add them when you choose your car and tell us each child's age, so the seat fits. Need more than two? Message us before you book.`,
  },
  {
    q: "Is this cheaper than an airport taxi?",
    a: "Not always, and we won't pretend otherwise. A metered taxi may come in lower on a quiet afternoon. What you're paying for is that the price cannot move, the car is booked before you land, and nobody is negotiating with you in a queue at midnight with tired children.",
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
