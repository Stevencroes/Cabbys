// How it works + Why Cabby's, as one route you read down.
//
// The page said the same thing twice. A step strip (Steps.tsx, now gone)
// walked through what happens after you book; the pillars (HowItWorks.tsx,
// also gone) listed why that is good — and two of the four pillars ("you
// know who's coming", "there before you are") were the steps again,
// restated as claims. Here each reason sits on the
// stop where a guest actually meets it: the fixed price when they book, free
// cancellation once it is confirmed, the flight being followed when they
// land, privacy on the ride itself. Eight blocks of copy become four stops.
//
// WHY IT IS A LIST YOU READ, NOT A SLIDESHOW THE SCROLL PLAYS. The version
// before this was a straight line across the band with one stop's words
// under it at a time, all four sharing one grid cell, and the scroll chose
// which. The owner: "not giving me chance to read". Measured at 390x844,
// it was three faults stacked:
//   - the whole journey was keyed to the line crossing 65% of the screen,
//     so on a phone two of the four stops got ~120px of scroll each — one
//     flick of a thumb — and a sentence half-read was swapped for the next;
//   - stop 1 was "showing" while its words were still below the fold, so
//     by the time the words were where an eye could rest on them the car
//     had reached stop 3 or 4, and stop 4 was all any later scroll showed;
//   - the car drove at its own pace behind the scroll (a leg, then a dwell
//     per stop), so the words also changed AFTER the reader stopped
//     scrolling — the text moved under someone who was holding still.
// Tuning the constants could only trade one of those for another, because
// the fault was the mechanic: one cell of words, rewritten by scroll. So
// every stop's words are now on the page at once, in order, and never
// change. The reader's own scroll is the pace — they can stop on a step for
// as long as they like, and go back to one without anything re-animating.
//
// The car stays, demoted from the thing that decides what you may read to a
// marker of where you are. It sits where the middle of the screen crosses
// the route — so on screen it holds still while the stops pass up under it
// — and the ring it has reached lights. Nothing it does touches the words.
// The rings are still buttons: one brings its step up to the car, which on
// a phone (where the route is a screen and a half) is a real shortcut.
//
// It runs DOWN, at every width. Across the band, the car's place along a
// horizontal line could only mean "how far the page has scrolled", which is
// not where anyone reading four columns is; down the page, scroll position
// and reading position are the same thing, so the car is honest.
//
// Every line is one the old two sections already stood behind, read from
// the same constants (src/lib/policy.ts), so Landing.test's promise checks
// apply unchanged.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SplitHeading } from "./motion";
import { useStartBooking } from "../booking/useStartBooking";
import { AIRPORT_FREE_WAIT_MINUTES, FREE_CANCEL_HOURS } from "../lib/policy";

/** The section's anchor — the nav and the footer sitemap both point here. */
export const JOURNEY_ID = "how-it-works";

type Stop = {
  key: string;
  title: string;
  body: string;
  icon: ReactNode;
  why: { title: string; body: string };
};

const STOPS: Stop[] = [
  {
    key: "book",
    title: "Book",
    body: "Pick your route, car and time. See the fixed price, and pay nothing now.",
    icon: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><path d="M3.5 9h17M8 3v3M16 3v3" /><path d="M9 14.2l2 2 4-4" /></>,
    why: {
      title: "The price is the price",
      body: "Fixed when you book. Traffic or a late flight won't change it.",
    },
  },
  {
    key: "confirm",
    title: "Get confirmed",
    body: "Your confirmation email arrives straight away.",
    icon: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.6 6.6 12 12.6l8.4-6" /></>,
    why: {
      // The FAQ's and the link preview's own claim, from the same number.
      title: "Plans change. That's fine.",
      body: `Cancel for free up to ${FREE_CANCEL_HOURS} hours before pickup.`,
    },
  },
  {
    key: "meet",
    title: "Meet your driver",
    body: "We email their name, car and plate. At the airport they wait in arrivals with your name on a sign.",
    icon: <><circle cx="12" cy="5.2" r="2.2" /><path d="M9.6 21v-6.4M14.4 21v-6.4M9.6 14.6 9.2 9.6h5.6l-.4 5" /><rect x="5" y="10.6" width="14" height="3.4" rx=".6" /></>,
    why: {
      title: "There before you are",
      body: `We follow your flight, then wait up to ${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, free.`,
    },
  },
  {
    key: "ride",
    title: "Ride and pay",
    body: "Pay your driver in cash at the end, in US dollars or florins.",
    icon: <><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.8 12h16.4v4.5H3.8z" /><circle cx="7.6" cy="14.3" r=".9" /><circle cx="16.4" cy="14.3" r=".9" /><path d="M6 16.5V19M18 16.5V19" /></>,
    why: {
      title: "Private, start to finish",
      body: "Just your group. No sharing, no detours.",
    },
  },
];

const N = STOPS.length;

/** Where on the screen the car sits, as a share of its height: the middle,
    where an eye reading down a page rests. The car is placed on the route
    wherever this line crosses it, so it is always level with the step being
    read, and a ring lights as its step comes up to it. */
export const READ = 0.5;

/**
 * Where the car is and which ring it has reached, from where things are on
 * screen. Pure, so it can be tested without a browser.
 *
 * `road` is the route's box (viewport coordinates), `rings` each stop's
 * ring centre in the same coordinates, `line` the reading line in px. The
 * car is the line's place along the road, held at the road's two ends; a
 * ring counts as reached once its centre is at or above the line. `active`
 * is -1 until the first one is — the car is still at "Your trip".
 */
export function readAt(road: { top: number; height: number }, rings: number[], line: number):
  { car: number; active: number; arrived: boolean } {
  const car = Math.min(road.height, Math.max(0, line - road.top));
  // half a pixel of give: a ring scrolled to the line by its own button
  // lands on it to within subpixel rounding, and must count as reached
  const active = rings.filter((y) => y <= line + 0.5).length - 1;
  return { car, active, arrived: road.height > 0 && car >= road.height - 0.5 };
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion:reduce)").matches;

function Mark({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function Journey() {
  const startBooking = useStartBooking();
  const [active, setActive] = useState(-1);
  const [arrived, setArrived] = useState(false);

  const road = useRef<HTMLSpanElement>(null);
  const rings = useRef<(HTMLButtonElement | null)[]>([]);

  /* The car is written straight to a custom property rather than through
     React: it moves on every scroll frame, and re-rendering the section
     sixty times a second is the version that stutters on a mid-range phone.
     React only hears about it when a ring is reached — four times down the
     page — and setState with an unchanged value does not re-render.

     There is no animation of its own here any more. The old car drove legs
     and dwelt at stops on a clock, which is what changed the words after
     the reader had stopped scrolling; this one is wherever the scroll puts
     it, so it never moves unless the reader does — which is also why it
     needs no reduced-motion branch: on screen it holds still. */
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = road.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      // Not laid out (hidden, or a test DOM with no layout): a zero box
      // would read as "already arrived" and light the end of the road.
      if (!box.height) return;
      const centres = rings.current.map((r) => {
        const b = r?.getBoundingClientRect();
        return b ? b.top + b.height / 2 : Infinity;
      });
      const r = readAt(box, centres, READ * window.innerHeight);
      el.style.setProperty("--car", `${r.car.toFixed(1)}px`);
      setActive(r.active);
      setArrived(r.arrived);
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    // The road's length changes without a resize event when the web fonts
    // land and the words rewrap; the car would sit off its line until the
    // next scroll.
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(ask) : null;
    if (road.current) ro?.observe(road.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      ro?.disconnect();
    };
  }, []);

  /** A ring brings its step up to the car: the page scrolls until that ring
      is on the reading line, and the car — which is wherever the line is —
      arrives with it. The words were already on the page; this only saves
      a phone reader the thumbing to get to them. */
  const goTo = (i: number) => {
    const ring = rings.current[i];
    if (!ring) return;
    const b = ring.getBoundingClientRect();
    const top = window.scrollY + b.top + b.height / 2 - READ * window.innerHeight;
    window.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <section className="journey-band" id={JOURNEY_ID}>
      <div className="wrap jwrap">
        <div className="sec-head">
          <div className="eyebrow rise">How it works</div>
          <SplitHeading className="sec"
            parts={[{ text: "From booking to drop-off, " }, { text: "no surprises.", em: true }]} />
        </div>

        <div className={`jroute${arrived ? " arrived" : ""}`}>
          {/* The road, first in the DOM so the rings paint over it: the car
              passes UNDER each ring as the ring comes up to it, and parks
              out of sight inside the arrival dot. --car is its place along
              the road in px; the trail is the same number, so the two can
              never disagree. */}
          <span className="jroad" ref={road} aria-hidden="true">
            <span className="jtrail" />
            {/* Drawn head-on, coming down the road at the reader. The side
                view the across-the-band line used, turned to run down,
                read as a phone battery. */}
            <span className="jcar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" />
                <path d="M3.8 12h16.4v4.5H3.8zM6 16.5V19M18 16.5V19" />
              </svg>
            </span>
          </span>

          <div className="jnode jstart" aria-hidden="true">
            <span className="jpin" />
            <span className="jnode-label">Your trip</span>
          </div>

          <ol className="jstops" aria-label="How it works, step by step">
            {STOPS.map((s, i) => (
              <li key={s.key} className="jstep">
                <button type="button" ref={(el) => { rings.current[i] = el; }}
                  className={`jstop${i === active ? " on" : ""}${i < active ? " past" : ""}`}
                  aria-label={s.title} aria-current={i === active ? "step" : undefined}
                  onClick={() => goTo(i)}>
                  <Mark>{s.icon}</Mark>
                </button>
                {/* The words carry no state at all — no class, no fade —
                    so nothing the car does can move them under a reader. */}
                <div className="jtext">
                  <div className="jcount">Step {i + 1} of {N}</div>
                  <h3>{s.title}</h3>
                  <p className="jbody">{s.body}</p>
                </div>
                {/* No icon: the reason is words beside the step, and a
                    second ring here competed with the stops on the line. */}
                <div className="jwhy">
                  <div className="jwhy-kick">Why Cabby's</div>
                  <p><strong>{s.why.title}</strong> {s.why.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="jnode jarrive" aria-hidden="true">
            <span className="jdot" />
            <em>Enjoy your trip.</em>
          </div>
        </div>

        {/* Outside the route so the road can end on the arrival dot without
            measuring anything. Always in the tab order now: it used to sit
            in the last of four faded panels and had to be taken out of the
            tab order until that panel showed. */}
        <div className="jend">
          <button type="button" className="jbook" onClick={() => startBooking()}>
            Book your ride
            <Mark size={18}><path d="M5 12h13M13 6.5 18.5 12 13 17.5" /></Mark>
          </button>
        </div>
      </div>
    </section>
  );
}
