// Reveal-on-scroll and word splits. CSS owns the animation (globals.css);
// this file only decides WHEN an element is allowed to move, and honours
// prefers-reduced-motion by never letting anything move at all.
import { useEffect } from "react";

const reduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion:reduce)").matches;

const SELECTOR = ".rise,.flow,.stagger,.wsplit";

/** Give a staggered group its per-child offset. CSS does the arithmetic
    (`calc(var(--i) * var(--stagger))`) so the gap stays a design token and
    not a number buried in a component. */
function index(group: Element): void {
  [...group.children].forEach((child, i) =>
    (child as HTMLElement).style.setProperty("--i", String(i)),
  );
}

/**
 * One-shot reveal for everything below the hero.
 *
 * Two things were wrong with what this replaces, and both were visible as
 * the same symptom — a section that fades halfway in and then stops.
 *
 * The first was an ordering bug. The old version added `.in` and THEN wrote
 * transition-delay onto each child of a `.stagger`. Changing transition-delay
 * on an element whose transition has already started does not shift it: it
 * cancels and restarts it, so every card snapped back to opacity 0 and sat
 * there for its delay before starting again. That is the stall, and it hit
 * exactly the two groups that use `.stagger` — the pillars and the vehicle
 * cards. Delays are now written when the element is first observed, before
 * anything has been asked to move.
 *
 * The second was the trigger. `threshold: 0.12` asks for 12% of the ELEMENT,
 * which for a `.flow` wrapping a whole 1200px section means 144px — a sliver
 * at the very bottom of the screen, so the section played its entrance
 * offscreen and was already finished by the time you could see it. A zero
 * threshold with a negative bottom margin fires on the top edge crossing a
 * line near the bottom of the viewport, which is the same moment whatever
 * the element's height.
 *
 * The third is not a bug that was reported but is the one that would have
 * been next: a fast flick can coalesce into a single non-intersecting entry,
 * and an element that is never observed intersecting never reveals. Anything
 * that has already gone past the top of the viewport is revealed on sight.
 */
export function useRevealObserver(): void {
  useEffect(() => {
    // The hero is on screen at first paint and stages itself from CSS
    // animations (see `.hero .rise` in globals.css). It must not wait on an
    // observer, a React commit, or anything else that can be late: the
    // headline is the LCP element.
    const els = [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter(
      (el) => !el.closest(".hero"),
    );

    if (reduced()) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }

    els.forEach((el) => {
      if (el.classList.contains("stagger")) index(el);
    });

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting && e.boundingClientRect.top >= 0) return;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }),
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

interface SplitPart {
  text: string;
  em?: boolean;
  /** start this part on its own line — a break the words reveal around,
      rather than one CSS has to guess at a given width */
  br?: boolean;
}

/** Word-by-word reveal heading. Text content stays a clean sentence —
 *  spaces live BETWEEN the overflow-hidden word spans, never inside them
 *  (an inline-block swallows its own trailing space). */
export function SplitHeading({
  parts,
  as: Tag = "h2",
  className = "",
  step = 0.06,
  delay = 0,
}: {
  parts: SplitPart[];
  as?: "h1" | "h2";
  className?: string;
  /** seconds between word reveals — 60-100ms is the band where a line reads
      as arriving rather than as popping in all at once */
  step?: number;
  /** seconds before the first word, so a headline can sit at a known point
      in a staged entrance instead of always leading it */
  delay?: number;
}) {
  let idx = 0;
  return (
    <Tag className={`wsplit ${className}`.trim()}>
      {parts.map((part, pi) => {
        const words = part.text.split(/\s+/).filter(Boolean);
        const nodes: React.ReactNode[] = [];
        words.forEach((w, wi) => {
          // Both properties, same value: below the hero a word is revealed by
          // a transition the observer triggers, inside it by an animation
          // that starts on its own. The offset is the same fact either way,
          // and writing one of the two would silently do nothing in half the
          // places this component is used.
          const at = `${(delay + idx * step).toFixed(3)}s`;
          idx++;
          nodes.push(
            <span key={wi} className="w">
              <i style={{ transitionDelay: at, animationDelay: at }}>{w}</i>
            </span>,
          );
          if (wi < words.length - 1) nodes.push(" ");
        });
        const trail = /\s$/.test(part.text) || pi < parts.length - 1 ? " " : "";
        const body = part.em ? (
          <em>{nodes}{trail}</em>
        ) : (
          <span style={{ display: "contents" }}>{nodes}{trail}</span>
        );
        return (
          <span key={pi} style={{ display: "contents" }}>
            {part.br && <br />}
            {body}
          </span>
        );
      })}
    </Tag>
  );
}
