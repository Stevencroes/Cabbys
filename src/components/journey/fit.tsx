// Shared plumbing for the two motion sections (Steps.tsx, HowItWorks.tsx).
//
// Every scene and tile is drawn at ONE fixed design size, in px, and scaled
// as a whole to the box it lands in. That is not laziness about responsive
// layout — the car in "Ride and pay" and the plane in "There before you are"
// travel along CSS offset-paths, and an offset-path is written in px. A
// scene that reflowed would move its own road out from under the car.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** useLayoutEffect in the browser, useEffect where there is no layout. */
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion:reduce)").matches;

/** A media query as live state, read synchronously on first render so a
    layout chosen by it never paints once in the wrong form and then swaps. */
export function useMedia(query: string): boolean {
  const read = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  const [on, setOn] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [query]);
  return on;
}

/**
 * Scale a fixed-size composition down to its container, never up.
 *
 * Never up, because these are drawn at the size their hairlines were judged
 * at — a 1px rule scaled to 1.3 is a blurred 1.3px rule. The wrapper takes
 * the scaled height so the page below it does not overlap or gap.
 */
export function Fit({ w, h, className = "", children }: {
  w: number; h: number; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width > 0) setK(Math.min(1, width / w));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    // The inner box is absolutely placed and centred, so its unscaled width
    // never takes part in layout — a 440px scene in a 320px column must not
    // push the page sideways while it is being drawn at 0.73.
    <div ref={ref} className={`fit ${className}`.trim()} style={{ height: h * k }}>
      <div className="fit-in" style={{ width: w, height: h, transform: `translateX(-50%) scale(${k})` }}>
        {children}
      </div>
    </div>
  );
}

/** True once the element has come into view — once. Under reduced motion it
    is true at once: nothing waits to be revealed when nothing moves. */
export function useSeenOnce<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting || e.boundingClientRect.top < 0)) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0, rootMargin: "0px 0px -18% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

/** Per-letter reveal, for the arrivals sign. Each letter is its own span so
    the reveal is a true typewriter, not a width clip that splits a glyph in
    a proportional face. Text content is still the plain name. */
export function Typed({ text, start, step = 70 }: { text: string; start: number; step?: number }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span key={i} className="a-type" style={{ ["--d" as string]: `${start + i * step}ms` }}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </>
  );
}

/** Shorthand for a delay custom property on an animated element. */
export const d = (ms: number) => ({ ["--d" as string]: `${ms}ms` }) as React.CSSProperties;
