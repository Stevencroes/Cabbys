// Shared Framer Motion variants + easings for the Cabby's site.
// Every consumer must pair these with `useReducedMotion()` (from framer-motion)
// and fall back to instant/no-transform states when the user prefers reduced motion.
import type { Variants, Transition } from "framer-motion";

// Calm-confidence easing — matches the CSS --ease cubic-bezier(.16,.84,.34,1).
export const EASE_CALM: Transition["ease"] = [0.16, 0.84, 0.34, 1];

// Section heading / block reveal on scroll: fade + 24px up.
export const revealUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_CALM } },
};

// Container that staggers its children (lists, card grids, headline words).
export const stagger = (gap = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

// Single word in a word-by-word headline reveal: fade + 16px rise.
export const wordRise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_CALM } },
};

// Generic child for a staggered group (cards, list items).
export const childRise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_CALM } },
};

// Reduced-motion-safe variant set: instant, no transform.
export const instant: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1 },
};

// Shared viewport config so reveals fire once, a little before fully in view.
export const inView = { once: true, amount: 0.3 } as const;
