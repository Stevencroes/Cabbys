// How it works + Why Cabby's: a still map of the trip, and the three
// reasons beside it.
//
// The page said the same thing twice. A step strip (Steps.tsx, now gone)
// walked through what happens after you book; the pillars (HowItWorks.tsx,
// also gone) listed why that is good, and two of the four pillars restated
// the steps as claims. This section has carried both ever since, as a route.
//
// WHY NOTHING MOVES. The route has been, in turn, a line the scroll drew
// with a car driving it, a line pinned for two and a half screens, a line
// across the band whose one cell of words the scroll rewrote, and a route
// down the page with a car marking the middle of the screen. The owner
// said of the third "not giving me chance to read", and of the fourth
// asked for the motion to go altogether, with everything still on the
// page. So: no scroll listener, no car, no lit ring, no state. Every word
// is there on the first frame and stays where it is.
//
// WHY IT IS SHORT. The owner also asked for the information to be kept
// minimal. Each stop is a title and one line, and the reasons are three,
// down from four steps of two sentences plus four reasons of two more.
// What came out was either said twice (the fixed price was in a step and
// a reason) or is said fully in the FAQ (the driver's name, car and plate,
// tips). What stayed is what a guest decides on: when they pay, how, where
// they are met, what a cancel costs and how long the driver waits — each
// read from the constant that decides it (src/lib/policy.ts), so
// Landing.test's promise checks still hold the copy to the product.
//
// THE SHAPE. On a wide screen the four stops are a 2 x 2 map the route
// snakes through — along the top, down the right, back along the bottom —
// so it reads as a journey at a glance, where four stops in a row read as
// a table. The order is in the DOM as 1-4 (it is an <ol>) and numbered on
// each ring, so the snake turning back on itself in row two never leaves
// anyone, sighted or not, unsure which stop comes next. On a phone the map
// straightens into a line down the page; there is no room for two columns
// of labels at 390px, and a line down is the shape a thumb scrolls anyway.
import type { ReactNode } from "react";
import { SplitHeading } from "./motion";
import { useStartBooking } from "../booking/useStartBooking";
import { AIRPORT_FREE_WAIT_MINUTES, FREE_CANCEL_HOURS } from "../lib/policy";

/** The section's anchor — the nav and the footer sitemap both point here. */
export const JOURNEY_ID = "how-it-works";

type Stop = { key: string; title: string; line: string; icon: ReactNode };

export const STOPS: Stop[] = [
  {
    key: "book",
    title: "Book online",
    line: "Pay nothing now.",
    icon: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><path d="M3.5 9h17M8 3v3M16 3v3" /><path d="M9 14.2l2 2 4-4" /></>,
  },
  {
    key: "confirm",
    title: "Get confirmed",
    line: "Confirmation by email, straight away.",
    icon: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.6 6.6 12 12.6l8.4-6" /></>,
  },
  {
    // "At the airport" is load-bearing: a hotel pickup gets no sign.
    key: "meet",
    title: "Meet your driver",
    line: "At the airport, in arrivals with your name on a sign.",
    icon: <><circle cx="12" cy="5.2" r="2.2" /><path d="M9.6 21v-6.4M14.4 21v-6.4M9.6 14.6 9.2 9.6h5.6l-.4 5" /><rect x="5" y="10.6" width="14" height="3.4" rx=".6" /></>,
  },
  {
    key: "ride",
    title: "Ride and pay",
    line: "Cash at the end, in US dollars or florins.",
    icon: <><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.8 12h16.4v4.5H3.8z" /><circle cx="7.6" cy="14.3" r=".9" /><circle cx="16.4" cy="14.3" r=".9" /><path d="M6 16.5V19M18 16.5V19" /></>,
  },
];

type Reason = { key: string; title: string; body: string; icon: ReactNode };

export const REASONS: Reason[] = [
  {
    key: "price",
    title: "The price is the price",
    body: "Fixed when you book. Traffic or a late flight won't change it.",
    icon: <><path d="M3.5 12.4V4.5h7.9l9.1 9.1-7.9 7.9z" /><circle cx="8" cy="9" r="1.4" /></>,
  },
  {
    // The FAQ's and the link preview's own claim, from the same number.
    key: "cancel",
    title: "Free cancellation",
    body: `Up to ${FREE_CANCEL_HOURS} hours before pickup.`,
    icon: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><path d="M3.5 9h17M8 3v3M16 3v3" /><path d="m10 12.6 4 4M14 12.6l-4 4" /></>,
  },
  {
    key: "flight",
    title: "We follow your flight",
    body: `Your driver waits up to ${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, free.`,
    icon: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  },
];

function Mark({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/* The map's route, drawn once at the map's own size (480 x 440, see
   .jmap). The map is a fixed size rather than fluid so this path is drawn
   1:1 and never stretched: a dashed line scaled unevenly to fit a box
   gets dashes of two lengths. Rails at x 16 and 464, rows at y 96 and
   272, corners of radius 24. The stops sit on the two horizontal runs, at
   x 136 and 344 — the same numbers as their --x/--y in the stylesheet. */
const ROUTE = "M16 12V72Q16 96 40 96H440Q464 96 464 120V248Q464 272 440 272H40Q16 272 16 296V420";

export default function Journey() {
  const startBooking = useStartBooking();

  return (
    <section className="journey-band" id={JOURNEY_ID}>
      <div className="wrap jwrap">
        <div className="sec-head">
          <div className="eyebrow rise">How it works</div>
          <SplitHeading className="sec"
            parts={[{ text: "From booking to drop-off, " }, { text: "no surprises.", em: true }]} />
        </div>

        <div className="jgrid">
          <div className="jmap">
            <svg className="jpath" width="480" height="440" viewBox="0 0 480 440" aria-hidden="true">
              <path d={ROUTE} />
            </svg>
            <div className="jend-node jstart" aria-hidden="true">
              <span className="jpin" />
              <span className="jnode-label">Your trip</span>
            </div>
            <ol className="jstops" aria-label="How it works, step by step">
              {STOPS.map((s, i) => (
                <li key={s.key} className={`jstop jstop-${i + 1}`}>
                  <span className="jring" aria-hidden="true">
                    <Mark>{s.icon}</Mark>
                    <span className="jnum">{i + 1}</span>
                  </span>
                  <span className="jlabel">
                    <h3>{s.title}</h3>
                    <span className="jline">{s.line}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="jend-node jarrive" aria-hidden="true">
              <span className="jdot" />
              <em>Enjoy your trip.</em>
            </div>
          </div>

          <div className="jwhy">
            <div className="jwhy-kick">Why Cabby's</div>
            <ul className="jreasons">
              {REASONS.map((r) => (
                <li key={r.key}>
                  <span className="jreason-icon" aria-hidden="true"><Mark size={20}>{r.icon}</Mark></span>
                  <span>
                    <strong>{r.title}</strong>
                    <span className="jreason-body">{r.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="jbook" onClick={() => startBooking()}>
              Book your ride
              <Mark size={18}><path d="M5 12h13M13 6.5 18.5 12 13 17.5" /></Mark>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
