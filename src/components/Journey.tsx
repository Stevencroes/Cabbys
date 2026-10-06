// How it works + Why Cabby's, as one route you scroll along.
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
// The first version was a winding route with a card beside it, worked by
// clicking. The owner found the card heavy and the route borrowed, so this
// one is a straight line that the page's own scroll drives: the car moves
// as the section passes up the screen, and the words under the line change
// as it reaches each stop. Nothing is hijacked — the scroll is never
// slowed, snapped or redirected.
//
// It used to pin: the section held still for two and a half screens of
// scroll while the car drove. The owner found that too long — a whole
// screen of one section, with nothing of the next in sight — so it is a
// band of its own height now, a little taller than the fleet's, and the
// journey runs while the line crosses the middle of the screen.
//
// Every line is one the old two sections already stood behind, read from
// the same constants (src/lib/policy.ts), so Landing.test's promise checks
// apply unchanged. All four panels stay in the DOM in order, only faded,
// so a screen reader reading down the page gets the whole sequence without
// having to scroll anything, and a crawler sees all of it.
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

/** Where each stop sits along the line, 0 (the start) to 1 (arrival).
    Evenly spaced, with the same gap before the first stop and after the
    last, so the car has a leg to drive at each end. */
const AT = STOPS.map((_, i) => (i + 1) / (N + 1));

/** The places the car can stand: 0 is the start, 1..N the stops, N + 1
    the arrival dot. */
const LAST = N + 1;
const posOf = (node: number) => node / LAST;

/** Of the scroll, the sliver at each end that belongs to the start and to
    the arrival; the stops share the rest evenly. */
const EDGE = 0.04;

/** Which place the scroll is asking for. The car does not go there
    directly — see drive() — it is only told where it should be heading. */
export function nodeAt(p: number): number {
  if (p < EDGE) return 0;
  if (p >= 1 - EDGE) return LAST;
  return 1 + Math.min(N - 1, Math.floor(((p - EDGE) / (1 - 2 * EDGE)) * N));
}

/* The pace. The car used to sit wherever the scroll put it, so its speed
   was the reader's scroll speed: one flick of a thumb and four stops went
   by, each sentence on screen for a frame or two. The owner asked for time
   to read. So the scroll now only says where the car should be heading,
   and the car drives there one leg at a time, at its own speed, and stops
   at every stop on the way for long enough to read what it says. A fast
   scroll does not skip a stop; the car catches up a beat behind. */
const LEG_MS = 600;
const DWELL_MS = 1100;

export type Drive = {
  /** the place the car is standing at, or last left */
  at: number;
  leg: { from: number; to: number; t0: number } | null;
  /** it may not set off again before this */
  holdUntil: number;
  /** a stop someone clicked: driven to straight, without a stop on the way */
  rush: number | null;
};

export const parked = (at = 0): Drive => ({ at, leg: null, holdUntil: 0, rush: null });

/**
 * One frame of the car, pure so the pace can be tested without a browser.
 * Returns the new state, where the car is along the line (0..1), the place
 * it pulled up at THIS frame if any, and whether it has nothing left to do.
 */
export function drive(s: Drive, want: number, now: number):
  { s: Drive; car: number; reached: number | null; idle: boolean } {
  let next = s;
  let reached: number | null = null;
  if (next.leg) {
    const { from, to, t0 } = next.leg;
    const t = Math.min(1, (now - t0) / LEG_MS);
    if (t < 1) {
      const e = t * t * (3 - 2 * t);
      return { s: next, car: posOf(from) + (posOf(to) - posOf(from)) * e, reached: null, idle: false };
    }
    reached = to;
    const rush = next.rush === to ? null : next.rush;
    // A stop is read; the start and the arrival dot have nothing to read.
    const isStop = to >= 1 && to <= N;
    next = { at: to, leg: null, rush, holdUntil: isStop && rush === null ? now + DWELL_MS : now };
  }
  const goal = next.rush ?? want;
  if (goal === next.at) return { s: next, car: posOf(next.at), reached, idle: true };
  if (now < next.holdUntil) return { s: next, car: posOf(next.at), reached, idle: false };
  const to = next.at + Math.sign(goal - next.at);
  return { s: { ...next, leg: { from: next.at, to, t0: now } }, car: posOf(next.at), reached, idle: false };
}

/** Where the line's middle is, as a share of the screen's height, when the
    journey starts and when it ends. It starts low, as the line comes up
    into view, and ends high, with the words under it still on screen and
    the next section's heading arriving below: that is the stretch where
    the whole band can be seen, and the car spends all of it driving. */
const FROM = 0.85;
const TO = 0.2;

/** The line's place on screen, to progress along the journey, 0..1. */
export function progressAt(rect: { top: number; height: number }, vh: number): number {
  if (!vh) return 0;
  const y = rect.top + rect.height / 2;
  return Math.min(1, Math.max(0, (FROM * vh - y) / ((FROM - TO) * vh)));
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
  const [active, setActive] = useState(0);
  const [arrived, setArrived] = useState(false);

  const line = useRef<HTMLDivElement>(null);
  const car = useRef<Drive>(parked());
  const want = useRef(0);
  const kick = useRef<() => void>(() => {});

  /* The car and the trail are written straight to a custom property each
     frame rather than through React: re-rendering the whole section sixty
     times a second is the version that stutters on a mid-range phone.
     React only hears about it when the car pulls up at a stop. */
  useEffect(() => {
    let raf = 0;
    let first = true;
    const draw = (c: number) => line.current?.style.setProperty("--car", c.toFixed(4));
    const show = (node: number) => {
      setActive(Math.min(N - 1, Math.max(0, node - 1)));
      setArrived(node === LAST);
    };
    const frame = (now: number) => {
      raf = 0;
      const r = drive(car.current, want.current, now);
      car.current = r.s;
      draw(r.car);
      if (r.reached !== null) show(r.reached);
      if (!r.idle) raf = requestAnimationFrame(frame);
    };
    const read = () => {
      const el = line.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      // Not laid out (hidden, or a test DOM with no layout): a zero box
      // reads as "scrolled past the top" and would open on the last stop.
      if (!box.height) return;
      want.current = nodeAt(progressAt(box, window.innerHeight));
      // A page opened, or reloaded, part-way down starts with the car
      // already where the scroll is — not a drive in from the start — and
      // a reader who asked for less motion never sees it drive at all.
      if (first || reducedMotion()) {
        first = false;
        car.current = parked(want.current);
        draw(posOf(want.current));
        show(want.current);
        return;
      }
      if (!raf) raf = requestAnimationFrame(frame);
    };
    kick.current = read;
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  /** A stop is still a button: it scrolls the page to where that stop is
      read, and the car drives straight there — no pause at the stops in
      between, which the reader has just said they want to skip. */
  const goTo = (i: number) => {
    const el = line.current;
    if (!el) return;
    car.current = { ...car.current, rush: i + 1, holdUntil: 0 };
    // the middle of the stop's stretch of scroll
    const p = EDGE + ((i + 0.5) / N) * (1 - 2 * EDGE);
    const vh = window.innerHeight;
    const y = (FROM - p * (FROM - TO)) * vh;
    const r = el.getBoundingClientRect();
    const top = window.scrollY + (r.top + r.height / 2) - y;
    window.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
    kick.current();
  };

  return (
    <section className="journey-band" id={JOURNEY_ID}>
      <div className="wrap jwrap">
        <div className="sec-head">
          <div className="eyebrow rise">How it works</div>
          <SplitHeading className="sec"
            parts={[{ text: "From booking to drop-off, " }, { text: "no surprises.", em: true }]} />
        </div>

        {/* The line. --car is the car's place along it, 0..1; the trail
            is the line's own width times the same number, so the two can
            never disagree. */}
        <div className={`jline${arrived ? " arrived" : ""}`} ref={line} style={{ ["--car" as string]: "0" }}>
          <span className="jstart" aria-hidden="true">Your trip</span>
          <div className="jroad">
            <span className="jtrail" aria-hidden="true" />
            {/* Before the stops in the DOM, so it passes UNDER the rings
                and parks out of sight inside the one it has reached. */}
            <span className="jcar" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6.5" width="18" height="11" rx="3.4" />
                <path d="M14.6 7v10M17.6 8.6v6.8" />
              </svg>
            </span>
            <ol className="jstops" aria-label="How it works, step by step">
              {STOPS.map((s, i) => (
                <li key={s.key} style={{ left: `${AT[i] * 100}%` }}>
                  <button type="button" className={`jstop${i === active ? " on" : ""}${i < active ? " past" : ""}`}
                    aria-current={i === active ? "step" : undefined} onClick={() => goTo(i)}>
                    <span className="jring"><Mark>{s.icon}</Mark></span>
                    <span className="jlabel">{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <span className={`jarrive${arrived ? " on" : ""}`} aria-hidden="true">
            <span className="jdot" />
            <em>Enjoy your trip.</em>
          </span>
        </div>

        {/* The words, with no box round them. All four share one grid
            cell so the block never changes height under the reader; the
            ones not showing are faded, not removed, and lean the way
            the car is going — the last stop's words leave upward, the
            next stop's arrive from below. */}
        <div className="jpanels">
          {STOPS.map((s, i) => {
            const on = i === active;
            const last = i === N - 1;
            return (
              <div key={s.key} className={`jpanel${on ? " on" : i < active ? " gone" : ""}`}>
                <div className="jstep">
                  <div className="jcount">Step {i + 1} of {N}</div>
                  <h3>{s.title}</h3>
                  <p className="jbody">{s.body}</p>
                  {last && (
                    <button type="button" className="jbook" tabIndex={on ? 0 : -1} onClick={() => startBooking()}>
                      Book your ride
                      <Mark size={18}><path d="M5 12h13M13 6.5 18.5 12 13 17.5" /></Mark>
                    </button>
                  )}
                </div>
                {/* No icon: the reason is words beside the step, and a
                    second ring here competed with the stops on the line. */}
                <div className="jwhy">
                  <div className="jwhy-kick">Why Cabby's</div>
                  <p><strong>{s.why.title}</strong> {s.why.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
