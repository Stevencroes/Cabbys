import { Fragment } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Diamond from "./Diamond";
import HeroBooking from "./booking/HeroBooking";
import { stagger, wordRise, EASE_CALM } from "../lib/motion";

const TITLE_WORDS = ["Arrive", "in"];

export default function Hero() {
  const prefersReduced = useReducedMotion();

  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <motion.div
            className="eyebrow"
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_CALM }}
          >
            <Diamond />
            Private transfers · Aruba
          </motion.div>

          <motion.h1
            className="hero-title"
            variants={prefersReduced ? undefined : stagger(0.12, 0.15)}
            initial={prefersReduced ? false : "hidden"}
            animate="show"
          >
            {TITLE_WORDS.map((w) => (
              <Fragment key={w}>
                <motion.span className="word" variants={wordRise}>
                  {w}
                </motion.span>{" "}
              </Fragment>
            ))}
            <motion.span className="word accent" variants={wordRise}>
              silence.
            </motion.span>
          </motion.h1>

          <motion.p
            className="hero-sub"
            initial={prefersReduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_CALM, delay: 0.55 }}
          >
            A car waiting before you ask. A driver who knows the island. The quiet
            certainty of a fixed price, settled before you arrive.
          </motion.p>

          {/* trust strip */}
          <motion.div
            className="hero-trust"
            initial={prefersReduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: EASE_CALM, delay: 0.8 }}
          >
            <span>Fixed prices</span>
            <Diamond hollow />
            <span>Licensed drivers</span>
            <Diamond hollow />
            <span>Flat-rate, no surge</span>
          </motion.div>
        </div>

        <HeroBooking />
      </div>

      <div className="hero-scroll" aria-hidden="true">
        <span>Scroll</span>
        <span className="hero-scroll-line" />
      </div>
    </section>
  );
}
