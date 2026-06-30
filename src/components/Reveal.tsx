import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { revealUp, childRise, stagger, inView } from "../lib/motion";

interface BaseProps {
  children: ReactNode;
  className?: string;
}

// Single block: fade + 24px up when scrolled into view.
export function Reveal({ children, className }: BaseProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={revealUp} initial="hidden" whileInView="show" viewport={inView}>
      {children}
    </motion.div>
  );
}

// Container that staggers its RevealItem children into view.
export function RevealGroup({ children, className, gap = 0.1 }: BaseProps & { gap?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={stagger(gap)} initial="hidden" whileInView="show" viewport={inView}>
      {children}
    </motion.div>
  );
}

// A staggered child — pass the styled className so it *is* the card.
export function RevealItem({ children, className }: BaseProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={childRise}>
      {children}
    </motion.div>
  );
}
