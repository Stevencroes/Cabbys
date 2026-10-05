// How it works + Why Cabby's, as one route you scroll along.
//
// The page said the same thing twice. Steps.tsx walked through what happens
// after you book; HowItWorks.tsx (the pillars) listed why that is good — and
// two of its four pillars ("you know who's coming", "there before you are")
// were the steps again, restated as claims. Here each reason sits on the
// stop where a guest actually meets it: the fixed price when they book, free
// cancellation once it is confirmed, the flight being followed when they
// land, privacy on the ride itself. Eight blocks of copy become four stops.
//
// The first version was a winding route with a card beside it, worked by
// clicking. The owner found the card heavy and the route borrowed, so this
// one is a straight line that the page's own scroll drives: the section
// pins, the car moves as you scroll, and the words under the line change
// as it reaches each stop. Nothing is hijacked — the scroll is never
// slowed, snapped or redirected; the section is simply taller than the
// screen and reports how far through it you are.
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
  why: { title: string; body: string; icon: ReactNode };
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
      icon: <><path d="M11.4 3.4 3.6 11.2a1.6 1.6 0 0 0 0 2.3l6.9 6.9a1.6 1.6 0 0 0 2.3 0l7.8-7.8V3.4Z" /><circle cx="16.4" cy="7.6" r="1.5" /></>,
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
      icon: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4.5v3.8h3.8" /></>,
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
      icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></>,
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
      icon: <><circle cx="9.2" cy="9.4" r="3.1" /><path d="M3.4 19c.6-3.4 2.9-5.2 5.8-5.2s5.2 1.8 5.8 5.2" /><path d="M15.8 7.4a3 3 0 0 1 0 5.5" /><path d="M17.6 19c-.25-1.6-.9-3-1.9-3.9" /></>,
    },
  },
];

const N = STOPS.length;

/** Where each stop sits along the line, 0 (the start) to 1 (arrival).
    Evenly spaced, with the same gap before the first stop and after the
    last, so the car has a leg to drive at each end. */
const AT = STOPS.map((_, i) => (i + 1) / (N + 1));

/** Of each stop's share of the scroll, the part spent driving to it; the
    rest the car is parked and the reader is reading. Under a third and the
    car lurches; over a half and a stop changes before its words are read. */
const DRIVE = 0.4;

/**
 * Scroll progress (0..1) to where the car is (0..1 along the line) and
 * which stop is showing. Each stop owns 1/N of the scroll: the car drives
 * in for the first DRIVE of it, then waits. The last stop's share ends
 * with the drive on to the arrival dot, so the trail reaches "you're here"
 * exactly as the section lets go.
 */
export function routeAt(p: number): { car: number; active: number; arrived: boolean } {
  const t = Math.min(Math.max(p, 0), 1) * N;
  const i = Math.min(N - 1, Math.floor(t));
  const local = t - i;
  const from = i === 0 ? 0 : AT[i - 1];
  const ease = (x: number) => x * x * (3 - 2 * x);
  let car = from + (AT[i] - from) * ease(Math.min(1, local / DRIVE));
  if (i === N - 1 && local > 1 - DRIVE / 2) {
    car = AT[i] + (1 - AT[i]) * ease((local - (1 - DRIVE / 2)) / (DRIVE / 2));
  }
  // The words change when the car is halfway there, not when it sets off:
  // the reader is still on the last stop's sentence as the car leaves it.
  const active = local < DRIVE / 2 && i > 0 ? i - 1 : i;
  return { car, active, arrived: car > 0.999 };
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
  const [started, setStarted] = useState(false);

  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);

  /* The car and the trail are written straight to a custom property each
     frame rather than through React: a scroll handler that re-renders the
     whole section sixty times a second is the version that stutters on a
     mid-range phone. React only hears about it when the STOP changes. */
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const t = track.current, s = stage.current;
      if (!t || !s) return;
      // Measured from where the stage STICKS, not from the top of the
      // screen: counted from 0, the last stretch ran a nav-height past the
      // end of the track and the whole stage slid up under the bar.
      const stick = parseFloat(getComputedStyle(s).top) || 0;
      const run = t.offsetHeight - s.offsetHeight;
      const p = run > 0 ? Math.min(1, Math.max(0, (stick - t.getBoundingClientRect().top) / run)) : 0;
      const r = routeAt(p);
      line.current?.style.setProperty("--car", r.car.toFixed(4));
      setActive(r.active);
      setArrived(r.arrived);
      setStarted(p > 0.015);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /** A stop is still a button: it scrolls the page to where that stop is
      parked, so a reader who would rather click — or who is on a keyboard —
      gets the same journey without having to scroll through it. */
  const goTo = (i: number) => {
    const t = track.current, s = stage.current;
    if (!t || !s) return;
    const run = t.offsetHeight - s.offsetHeight;
    // the middle of the stop's parked stretch, clear of both changeovers
    const p = (i + DRIVE + (1 - DRIVE) / 2 - (i === N - 1 ? DRIVE / 4 : 0)) / N;
    const stick = parseFloat(getComputedStyle(s).top) || 0;
    const top = window.scrollY + t.getBoundingClientRect().top - stick + p * run;
    window.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <section className="journey-band" id={JOURNEY_ID}>
      <div className="jtrack" ref={track}>
        <div className="jstage" ref={stage}>
          <div className="wrap jwrap">
            <div className="sec-head">
              <div className="eyebrow rise">How it works</div>
              <SplitHeading className="sec"
                parts={[{ text: "From booking to arrivals, " }, { text: "no surprises.", em: true }]} />
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
                <em>Bon bini.</em>
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
                    <div className="jwhy">
                      <span className="jwhy-mark"><Mark size={20}>{s.why.icon}</Mark></span>
                      <div>
                        <div className="jwhy-kick">Why Cabby's</div>
                        <p><strong>{s.why.title}</strong> {s.why.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`jhint${started ? " off" : ""}`} aria-hidden="true">
              Scroll to follow your trip
              <Mark size={16}><path d="M12 5v13M6.5 12.5 12 18l5.5-5.5" /></Mark>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
