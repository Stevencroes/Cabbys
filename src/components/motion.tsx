// v3 motion system — reveal-on-scroll, word splits, parallax suns.
// CSS owns the animation (globals.css); this wires the observers and
// honours prefers-reduced-motion by never registering listeners.
import { useEffect } from "react";

const reduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion:reduce)").matches;

/** Observes .rise / .flow / .stagger / .wsplit inside the page. */
export function useRevealObserver(): void {
  useEffect(() => {
    const els = document.querySelectorAll(".rise,.flow,.stagger,.wsplit");
    if (reduced()) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("in");
          if (e.target.classList.contains("stagger")) {
            [...e.target.children].forEach((c, i) => {
              (c as HTMLElement).style.transitionDelay = i * 0.09 + "s";
            });
          }
          io.unobserve(e.target);
        }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/** Parallax for .par elements (the suns). */
export function useParallax(): void {
  useEffect(() => {
    if (reduced()) return;
    let ticking = false;
    const run = () => {
      document.querySelectorAll<HTMLElement>(".par").forEach((el) => {
        const sp = parseFloat(el.dataset.speed || "-.05");
        const r = el.getBoundingClientRect();
        const off = (r.top + r.height / 2 - innerHeight / 2) * sp;
        el.style.transform = `translate3d(-50%,${off.toFixed(1)}px,0)`;
      });
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(run);
        ticking = true;
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    run();
    return () => removeEventListener("scroll", onScroll);
  }, []);
}

interface SplitPart {
  text: string;
  em?: boolean;
}

/** Word-by-word reveal heading. Text content stays a clean sentence —
 *  spaces live BETWEEN the overflow-hidden word spans, never inside them
 *  (an inline-block swallows its own trailing space). */
export function SplitHeading({
  parts,
  as: Tag = "h2",
  className = "",
}: {
  parts: SplitPart[];
  as?: "h1" | "h2";
  className?: string;
}) {
  let idx = 0;
  return (
    <Tag className={`wsplit ${className}`.trim()}>
      {parts.map((part, pi) => {
        const words = part.text.split(/\s+/).filter(Boolean);
        const nodes: React.ReactNode[] = [];
        words.forEach((w, wi) => {
          const delay = idx * 0.055;
          idx++;
          nodes.push(
            <span key={wi} className="w">
              <i style={{ transitionDelay: `${delay}s` }}>{w}</i>
            </span>,
          );
          if (wi < words.length - 1) nodes.push(" ");
        });
        const trail = /\s$/.test(part.text) || pi < parts.length - 1 ? " " : "";
        return part.em ? (
          <em key={pi}>{nodes}{trail}</em>
        ) : (
          <span key={pi} style={{ display: "contents" }}>{nodes}{trail}</span>
        );
      })}
    </Tag>
  );
}
