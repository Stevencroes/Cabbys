// How it works + Why Cabby's, as one route you can follow.
//
// The page said the same thing twice. Steps.tsx walked through what happens
// after you book; HowItWorks.tsx (the pillars) listed why that is good — and
// two of its four pillars ("you know who's coming", "there before you are")
// were the steps again, restated as claims. Here each reason sits on the
// stop where a guest actually meets it: the fixed price when they book, free
// cancellation once it is confirmed, the flight being followed when they
// land, privacy on the ride itself. Eight blocks of copy become four stops.
//
// Every line is one the old two sections already stood behind, read from
// the same constants (src/lib/policy.ts), so Landing.test's promise checks
// apply to this unchanged. The drawn route is a picture of the order; the
// stops are real tabs, and every panel stays in the DOM, so a screen reader,
// a crawler and a copy-paste all get the whole sequence, not just the stop
// on show.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { SplitHeading } from "./motion";
import { useStartBooking } from "../booking/useStartBooking";
import { AIRPORT_FREE_WAIT_MINUTES, FREE_CANCEL_HOURS } from "../lib/policy";

/** The section's anchor — the nav and the footer sitemap both point here. */
export const JOURNEY_ID = "how-it-works";

type Stop = {
  key: string;
  title: string;
  body: string;
  /** where the stop sits on the drawn route, in the SVG's own units */
  at: [number, number];
  icon: ReactNode;
  why: { title: string; body: string; icon: ReactNode };
};

/* The route, in viewBox units. Two rows run as a snake — left to right,
   down, right to left — and end on the arrival dot, the shape the owner's
   reference used. One geometry for every width: the box keeps its aspect
   ratio and the stops are placed by percentage of it, so the buttons
   (which keep their real size) always sit on the line they belong to. */
const W = 560;
const H = 440;
const ROUTE = "M36 16 V58 Q36 96 74 96 H486 Q524 96 524 134 V252 Q524 290 486 290 H86 Q48 290 48 328 V410";
const ARRIVAL: [number, number] = [48, 410];

const STOPS: Stop[] = [
  {
    key: "book",
    title: "Book",
    body: "Pick your route, car and time. See the fixed price, and pay nothing now.",
    at: [170, 96],
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
    at: [390, 96],
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
    at: [390, 290],
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
    at: [170, 290],
    icon: <><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.8 12h16.4v4.5H3.8z" /><circle cx="7.6" cy="14.3" r=".9" /><circle cx="16.4" cy="14.3" r=".9" /><path d="M6 16.5V19M18 16.5V19" /></>,
    why: {
      title: "Private, start to finish",
      body: "Just your group. No sharing, no detours.",
      icon: <><circle cx="9.2" cy="9.4" r="3.1" /><path d="M3.4 19c.6-3.4 2.9-5.2 5.8-5.2s5.2 1.8 5.8 5.2" /><path d="M15.8 7.4a3 3 0 0 1 0 5.5" /><path d="M17.6 19c-.25-1.6-.9-3-1.9-3.9" /></>,
    },
  },
];

/** How long the tour rests on a stop. Long enough to read the step and its
    reason twice at an unhurried pace; WCAG 2.2.2 asks for a pause control on
    anything that moves on its own past five seconds, and there is one. */
const DWELL_MS = 6500;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion:reduce)").matches;

const pct = ([x, y]: [number, number]) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

function Mark({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Distance along the route to each stop. Found by walking the path rather
    than written down, so redrawing ROUTE cannot leave the car parking
    somewhere the stop is not. Null where the browser cannot measure an SVG
    path (jsdom) — the route then simply does not animate. */
function measure(path: SVGPathElement | null): { total: number; at: number[] } | null {
  if (!path || typeof path.getTotalLength !== "function") return null;
  let total: number;
  try { total = path.getTotalLength(); } catch { return null; }
  if (!total) return null;
  const at = STOPS.map(({ at: [sx, sy] }) => {
    let best = 0, bestD = Infinity;
    for (let l = 0; l <= total; l += 1) {
      const p = path.getPointAtLength(l);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bestD) { bestD = d; best = l; }
    }
    return best;
  });
  return { total, at };
}

export default function Journey() {
  const startBooking = useStartBooking();
  const [active, setActive] = useState(0);
  // The tour runs until the guest touches anything, then never again: a
  // reader who has taken the wheel should not have it taken back.
  const [touring, setTouring] = useState(true);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [hovering, setHovering] = useState(false);

  const section = useRef<HTMLElement>(null);
  const route = useRef<SVGPathElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const car = useRef<HTMLSpanElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const geo = useRef<ReturnType<typeof measure>>(null);
  const pos = useRef(0);
  const raf = useRef(0);
  const arrived = useRef(false);

  /* ---------- the car ----------
     Drawn by hand each frame rather than by React: sixty re-renders a
     second of the whole section to move one dot was the first version,
     and it stuttered on a mid-range phone. */
  const place = useCallback((l: number, moving: boolean) => {
    const g = geo.current, path = route.current;
    if (!g || !path) return;
    pos.current = l;
    trail.current?.style.setProperty("stroke-dashoffset", String(g.total - l));
    const el = car.current;
    if (!el) return;
    const p = path.getPointAtLength(l);
    const a = path.getPointAtLength(Math.max(0, l - 1));
    const b = path.getPointAtLength(Math.min(g.total, l + 1));
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    el.style.left = `${(p.x / W) * 100}%`;
    el.style.top = `${(p.y / H) * 100}%`;
    el.style.setProperty("--heading", `${deg}deg`);
    el.classList.toggle("moving", moving);
  }, []);

  const driveTo = useCallback((i: number) => {
    const g = geo.current;
    if (!g) return;
    cancelAnimationFrame(raf.current);
    // The last stop drives on to the arrival dot: the ride is the leg that
    // ends somewhere, and a trail stopping short of "you're here" said the
    // trip was not over.
    const from = pos.current, to = i === STOPS.length - 1 ? g.total : g.at[i];
    if (reducedMotion() || from === to) { place(to, false); return; }
    // Time scales with distance, inside the motion scale's reveal band:
    // one stop over is a short hop, the far end of the route a real drive.
    const ms = Math.min(1100, Math.max(520, Math.abs(to - from) * 1.6));
    const t0 = performance.now();
    const ease = (t: number) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      place(from + (to - from) * ease(t), t < 1);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [place]);

  useEffect(() => {
    geo.current = measure(route.current);
    // The trail is one dash the length of the whole route, slid along by
    // its offset; until the route is measured it has no dash, and so is
    // not drawn at all.
    if (geo.current) {
      trail.current?.style.setProperty("stroke-dasharray", `${geo.current.total} ${geo.current.total}`);
      place(0, false);
    }
    return () => cancelAnimationFrame(raf.current);
  }, [place]);

  // In view: the first time, the car drives in from the start of the route
  // to the first stop, so the line reads as a journey before anyone reads a
  // word. Out of view, the tour stops counting.
  useEffect(() => {
    const el = section.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting);
      if (e.isIntersecting && !arrived.current) {
        arrived.current = true;
        driveTo(0);
      }
    }, { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, [driveTo]);

  useEffect(() => { if (arrived.current) driveTo(active); }, [active, driveTo]);

  const running = touring && !paused && inView && !hovering && !reducedMotion();
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STOPS.length), DWELL_MS);
    return () => window.clearTimeout(t);
  }, [running, active]);

  const choose = (i: number, focus = false) => {
    setTouring(false);
    setActive(i);
    if (focus) tabs.current[i]?.focus();
  };

  // Arrow keys move along the route, the tabs pattern's own keys. Left and
  // up both go back: on the second row the route runs right to left, and a
  // reader following the line should not have to think about which.
  const onKey = (e: KeyboardEvent) => {
    const last = STOPS.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? Math.min(last, active + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? Math.max(0, active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    choose(next, true);
  };

  const showTourToggle = touring && !reducedMotion();

  return (
    <section className="band journey-band" id={JOURNEY_ID} ref={section}
      onPointerEnter={() => setHovering(true)} onPointerLeave={() => setHovering(false)}>
      <div className="wrap">
        <div className="sec-head">
          <div className="eyebrow rise">How it works</div>
          <SplitHeading className="sec" parts={[{ text: "From booking to arrivals, " }, { text: "no surprises.", em: true }]} />
        </div>

        <div className="journey">
          <div className="jmap" style={{ aspectRatio: `${W} / ${H}` }}>
            <svg className="jroute" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
              <path ref={route} className="jroad" d={ROUTE} />
              <path ref={trail} className="jtrail" d={ROUTE} />
            </svg>

            <span className="jstart" style={pct([36, 16])} aria-hidden="true">Your trip</span>

            {/* Before the stops in the DOM, so it passes UNDER them and
                parks out of sight inside the ring it drives to. */}
            <span className="jcar" ref={car} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6.5" width="18" height="11" rx="3.4" />
                <path d="M14.6 7v10M17.6 8.6v6.8" />
              </svg>
            </span>
            <div className="jstops" role="tablist" aria-label="How it works, step by step" onKeyDown={onKey}>
              {STOPS.map((s, i) => {
                const on = i === active;
                return (
                  <button key={s.key} type="button" role="tab" id={`jtab-${s.key}`}
                    ref={(b) => { tabs.current[i] = b; }}
                    className={`jstop${on ? " on" : ""}${i < active ? " past" : ""}`}
                    style={pct(s.at)} aria-selected={on} aria-controls={`jpanel-${s.key}`}
                    tabIndex={on ? 0 : -1} onClick={() => choose(i)}>
                    <span className="jring"><Mark>{s.icon}</Mark></span>
                    <span className="jlabel">{s.title}</span>
                  </button>
                );
              })}
            </div>


            <span className={`jarrive${active === STOPS.length - 1 ? " on" : ""}`} style={pct(ARRIVAL)} aria-hidden="true">
              <span className="jdot" />
              <span className="jarrive-label"><em>Bon bini.</em> You're here.</span>
            </span>

            {showTourToggle && (
              <button type="button" className="jtour" onClick={() => setPaused((p) => !p)}
                aria-pressed={paused}>
                {paused
                  ? <Mark size={16}><path d="M8 5.5v13l10.5-6.5Z" /></Mark>
                  : <Mark size={16}><path d="M8.5 5.5v13M15.5 5.5v13" /></Mark>}
                {paused ? "Play tour" : "Pause tour"}
              </button>
            )}
          </div>

          <div className="jpanels">
            {STOPS.map((s, i) => {
              const on = i === active;
              const last = i === STOPS.length - 1;
              return (
                <div key={s.key} role="tabpanel" id={`jpanel-${s.key}`} aria-labelledby={`jtab-${s.key}`}
                  className={`jpanel${on ? " on" : ""}`} tabIndex={on ? 0 : -1}>
                  <div className="jcount">Step {i + 1} of {STOPS.length}</div>
                  <h3>{s.title}</h3>
                  <p className="jbody">{s.body}</p>

                  <div className="jwhy">
                    <span className="jwhy-mark"><Mark size={20}>{s.why.icon}</Mark></span>
                    <div>
                      <div className="jwhy-kick">Why Cabby's</div>
                      <p><strong>{s.why.title}</strong> {s.why.body}</p>
                    </div>
                  </div>

                  <div className="jnav">
                    {/* Not rendered on the first stop rather than disabled:
                        a greyed button with nowhere to go is a question the
                        reader has to answer. */}
                    {i > 0 && (
                      <button type="button" className="jprev" onClick={() => choose(i - 1)}
                        tabIndex={on ? 0 : -1} aria-label={`Back: ${STOPS[i - 1].title}`}>
                        <Mark size={18}><path d="M14.5 6 8.5 12l6 6" /></Mark>
                      </button>
                    )}
                    {last ? (
                      <button type="button" className="jnext jbook" tabIndex={on ? 0 : -1} onClick={() => startBooking()}>
                        Book your ride
                      </button>
                    ) : (
                      <button type="button" className="jnext" tabIndex={on ? 0 : -1} onClick={() => choose(i + 1)}>
                        Next: {STOPS[i + 1].title}
                        <Mark size={18}><path d="M9.5 6l6 6-6 6" /></Mark>
                      </button>
                    )}
                  </div>
                  {on && running && <span className="jtimer" key={active} style={{ animationDuration: `${DWELL_MS}ms` }} aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
