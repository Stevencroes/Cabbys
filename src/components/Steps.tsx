// How it works — what happens after you book, in the order it happens.
//
// The page sold the benefits ("Why Cabby's", HowItWorks.tsx — misnamed,
// it holds the pillars) and never said what happens after a guest presses
// Book. Each step is one the product keeps: the fixed price with nothing
// taken up front (cash, src/lib/rides.ts books guest-first), the
// confirmation email (buildGuestEmail), the driver email (buildDriverEmail)
// and the arrivals-hall sign. Landing.test pins this strip against the
// promises the page once made and the product never kept.
//
// THE MOTION. The owner's note on the text-only strip was "too much text":
// four paragraphs side by side read as a form to fill in, not a journey.
// So the strip became a journey you scroll through. On a desktop the stage
// pins while the guest scrolls; a small car drives down the rail from stop
// to stop, dwells at each one, and the stage plays that step's scene — the
// panel being booked, the email landing, the sign being lettered, the drive
// and the cash. Only the current step's line is shown beside it, so at any
// moment there is ONE sentence to read and a picture of it.
//
// Pinning is scroll-LINKED, not scroll-jacked: the page scrolls at its own
// speed and nothing intercepts the wheel. It is only used where it can
// work — a desktop tall enough to hold the stage, with motion allowed.
// Everywhere else (a phone, a short window, reduced motion) the same four
// steps are a list, each with its scene under it, played as it arrives
// (or, with reduced motion, simply shown finished).
import { useCallback, useEffect, useRef, useState } from "react";
import { SplitHeading } from "./motion";
import { StepScene } from "./journey/StepScenes";
import { reducedMotion, useMedia, useSeenOnce } from "./journey/fit";

/** The section's anchor — the nav and the footer sitemap both point here. */
export const STEPS_ID = "how-it-works";

const STEPS: { title: string; body: string }[] = [
  { title: "Book", body: "Pick your route, car and time. See the fixed price, and pay nothing now." },
  { title: "Get confirmed", body: "Your confirmation email arrives straight away." },
  { title: "Meet your driver", body: "We email their name, car and plate. At the airport they wait in arrivals with your name on a sign." },
  { title: "Ride and pay", body: "Pay your driver in cash at the end, in US dollars or florins." },
];
const N = STEPS.length;

/** Where pinning is worth it. 901px is the site's tablet break; 700px tall
    is what the stage (460px) needs under the nav with air above and below.
    Below either, a pinned stage would be cramped or cropped. */
const PIN_QUERY = "(min-width:901px) and (min-height:700px) and (prefers-reduced-motion:no-preference)";

/** Share of each step's scroll spent PARKED at its stop before the car
    pulls away for the next. A car that is always moving never arrives. */
const DWELL = 0.58;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function Steps() {
  const pinned = useMedia(PIN_QUERY);
  return (
    <section className="band steps-band" id={STEPS_ID} data-mode={pinned ? "pin" : "list"}>
      <div className="wrap">
        <div className="sec-head">
          <div className="eyebrow rise">How it works</div>
          <SplitHeading className="sec" parts={[{ text: "What happens " }, { text: "after you book.", em: true }]} />
        </div>
        {pinned ? <Pinned /> : <Listed />}
      </div>
    </section>
  );
}

/** The list a step is drawn in, either way. role="list" is not redundant:
    the markers are drawn, so the list has list-style:none, and Safari /
    VoiceOver drops the list role from a list styled that way — the "1 of 4"
    that makes this an ordered sequence would be gone for exactly the reader
    who cannot see the numerals. The numerals are aria-hidden for the same
    reason: the list already announces the position. */

/* ── desktop: the pinned journey ─────────────────────────────────────── */
function Pinned() {
  const track = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false);
  const activeRef = useRef(0);

  // One measurement per frame at most, and only while the section is near
  // the viewport. The car's position is written straight to a custom
  // property — React re-renders four times on the way down (once per
  // step), not sixty times a second.
  useEffect(() => {
    const t = track.current, s = stick.current;
    if (!t || !s) return;
    let raf = 0, near = false;

    const frame = () => {
      raf = 0;
      const top = parseFloat(getComputedStyle(s).top) || 0;
      const range = Math.max(1, t.offsetHeight - s.offsetHeight);
      const p = Math.min(1, Math.max(0, (top - t.getBoundingClientRect().top) / range));
      const seg = Math.min(N - 1, Math.floor(p * N));
      const local = p * N - seg;
      const travel = seg < N - 1 ? ease(Math.min(1, Math.max(0, (local - DWELL) / (1 - DWELL)))) : 0;
      t.style.setProperty("--car", String((seg + travel) / (N - 1)));
      t.style.setProperty("--p", p.toFixed(4));
      if (seg !== activeRef.current) { activeRef.current = seg; setActive(seg); }
    };
    const onScroll = () => { if (near && !raf) raf = requestAnimationFrame(frame); };

    const io = new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      if (near) { setLive(true); onScroll(); }
    }, { rootMargin: "20% 0px 20% 0px" });
    io.observe(t);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    frame();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /** A step's title is a button: it scrolls the page to the point where
      that step is parked, so the journey can be skipped through by click
      or keyboard as well as by scrolling. */
  const go = useCallback((i: number) => {
    const t = track.current, s = stick.current;
    if (!t || !s) return;
    const top = parseFloat(getComputedStyle(s).top) || 0;
    const range = t.offsetHeight - s.offsetHeight;
    const p = (i + DWELL * 0.5) / N;
    window.scrollTo({
      top: window.scrollY + t.getBoundingClientRect().top - top + p * range,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, []);

  return (
    <div className="hiw-track" ref={track}>
      <div className="hiw-stick" ref={stick}>
        <div className="hiw-rail-col">
          <span className="hiw-rail" aria-hidden="true">
            <span className="hiw-rail-fill" />
            <span className="hiw-car" />
          </span>
          <ol className="steps hiw-steps" role="list">
            {STEPS.map((s, i) => {
              const state = i === active ? " on" : i < active ? " past" : "";
              return (
                <li className={`step${state}`} key={s.title} aria-current={i === active ? "step" : undefined}>
                  <span className="snum" aria-hidden="true">{i + 1}</span>
                  <div className="sbody">
                    <h3><button type="button" onClick={() => go(i)}>{s.title}</button></h3>
                    {/* Every line stays in the document — a screen reader
                        reads all four in order, which is the right reading
                        for a sequence. Only the eye is shown one at a time. */}
                    <p>{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="hiw-stage">
          {STEPS.map((s, i) => (
            <StepScene key={s.title} index={i} play={live && i === active}
              className={i === active ? "is-on" : i < active ? "is-past" : ""} />
          ))}
          <div className="hiw-count" aria-hidden="true">
            <span className="hiw-count-n">{active + 1}</span>
            <span className="hiw-count-of">/ {N}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── phone, short window, reduced motion: the list ───────────────────────
   Each step reveals itself (useSeenOnce) rather than through the page
   sweep's `.stagger`. The sweep collects its elements once, when Landing
   mounts — a list that mounts later, because the window was resized out of
   the pinned layout, would never be collected and would sit at opacity 0. */
function Listed() {
  return (
    <ol className="steps hiw-list" role="list">
      {STEPS.map((s, i) => <ListedStep key={s.title} i={i} {...s} />)}
    </ol>
  );
}

function ListedStep({ i, title, body }: { i: number; title: string; body: string }) {
  const [ref, seen] = useSeenOnce<HTMLLIElement>();
  return (
    <li className={`step${seen ? " seen" : ""}`} ref={ref}>
      <span className="snum" aria-hidden="true">{i + 1}</span>
      <div className="sbody">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <StepScene index={i} play={seen} className="scene-card" />
    </li>
  );
}
