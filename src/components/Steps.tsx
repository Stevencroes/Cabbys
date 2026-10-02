// How it works — what happens after you book, in the order it happens.
//
// The page sold the benefits ("Why Cabby's", HowItWorks.tsx — misnamed,
// it holds the pillars) and never walked a guest through the process, so
// the one question a person hovering over the booking card is actually
// asking — "and if I press this, then what?" — had no answer until they
// had already pressed it. Every step below now exists, and each sentence
// is one the product keeps:
//
//   1. the card and the flow: route, car and time, the fixed price shown
//      before anything is committed, no account, nothing taken up front
//      (src/lib/rides.ts books guest-first; the payment step says cash)
//   2. buildGuestEmail (api/booking-alerts.ts), sent from BOOKINGS_EMAIL
//      the moment the row lands; inside MIN_NOTICE_HOURS the same email
//      promises a WhatsApp reply within confirmWindowLabel()
//   3. buildDriverEmail: name, car and plate on assignment, and again,
//      worded as a change, if the driver changes. My trips is an ACCOUNT
//      screen (MyTrips.tsx renders nothing for a guest), and a guest's
//      bookings join an account made with the same email
//      (docs/guest-claim.sql) — so the step says how to get there rather
//      than implying every guest already has it
//   4. the sign is arrivals-only (Step3Details' signTrip: a hotel pickup
//      gets no sign), the waits are policy.ts's, the phone number is
//      canContactDriver's ACTIVE_LEAD_HOURS window, and the fare is cash
//
// Every number is read from the constant that decides it. The pillars and
// the FAQ once promised a photo "the morning you travel", a late-cancel
// fee and a card charge; Landing.test pins this strip against the same
// list, so none of them can come back through here.
import { SplitHeading } from "./motion";
import { MIN_NOTICE_HOURS, durationLabel } from "../lib/derivedTime";
import { AIRPORT_FREE_WAIT_MINUTES, ADDRESS_FREE_WAIT_MINUTES, confirmWindowLabel } from "../lib/policy";
import { ACTIVE_LEAD_HOURS } from "../lib/tripStatus";
import { BOOKINGS_EMAIL } from "../lib/site";

const [mailbox, domain] = BOOKINGS_EMAIL.split("@");

/** The section's anchor — the nav and the footer sitemap both point here. */
export const STEPS_ID = "how-it-works";

interface Step {
  title: string;
  body?: React.ReactNode;
  /** a short checklist instead of a sentence — "on the day" is four
      separate things a guest will look for one at a time */
  list?: React.ReactNode[];
}

const STEPS: Step[] = [
  {
    title: "Book in a couple of minutes",
    body: "Choose the route, the car and the time, and see the fixed price before you book. No account needed, and nothing is charged up front.",
  },
  {
    title: "Confirmed by email, straight away",
    // The address is the useful part: it is what a guest searches their
    // inbox, and their spam, for. A 27-character address has no spaces, so
    // at a desktop column's width the browser broke it as "cabbystransfer.c
    // / om"; the <wbr> offers the one break a reader expects, after the @.
    body: <>
      It comes from <span className="steps-addr">{mailbox}@<wbr />{domain}</span>. Booking less
      than {durationLabel(MIN_NOTICE_HOURS * 60)} ahead? A person checks it as well, and confirms on
      WhatsApp within {confirmWindowLabel()}.
    </>,
  },
  {
    title: "Your driver's name, car and plate",
    body: "By email, once a driver is assigned — and again if your driver changes. Create an account with the email you booked with and the trip appears in My trips.",
  },
  {
    title: "On the day",
    list: [
      "At the airport, your driver waits inside the arrivals hall with a sign with your name.",
      `Waiting is free: ${AIRPORT_FREE_WAIT_MINUTES} minutes after you actually land, ${ADDRESS_FREE_WAIT_MINUTES} at an address.`,
      `Their phone number shows in My trips ${durationLabel(ACTIVE_LEAD_HOURS * 60)} before pickup.`,
      "You pay in cash at the end of the ride — US dollars or florins.",
    ],
  },
];

export default function Steps() {
  return (
    <section className="band steps-band" id={STEPS_ID}>
      <div className="wrap">
        <div className="sec-head">
          <div className="eyebrow rise">How it works</div>
          <SplitHeading className="sec" parts={[{ text: "What happens " }, { text: "after you book.", em: true }]} />
        </div>

        {/* role="list" is not redundant. The markers are drawn, so the list
            has list-style:none, and Safari/VoiceOver drops the list role from
            a list styled that way — the "1 of 4" that makes this an ordered
            sequence would be gone for exactly the reader who cannot see the
            numerals. The numerals are aria-hidden for the same reason: the
            list already announces the position, and "1, Book in…" read out
            after "1 of 4" says it twice. */}
        <ol className="steps stagger" role="list">
          {STEPS.map((s, i) => (
            <li className="step" key={s.title}>
              <span className="snum" aria-hidden="true">{i + 1}</span>
              <div className="sbody">
                <h3>{s.title}</h3>
                {s.body && <p>{s.body}</p>}
                {s.list && (
                  <ul className="sday" role="list">
                    {s.list.map((line, j) => <li key={j}>{line}</li>)}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
