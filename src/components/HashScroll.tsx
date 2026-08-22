// Anchors that survive a route change.
//
// "/#fleet" tapped from /trips is two things at once: a route change and a
// scroll target. The browser only ever tries the scroll once, at parse time,
// when React has not yet rendered a #fleet to scroll to — so the traveler
// lands at the top of the homepage and has to hunt. This watches the router's
// own location and keeps looking for the target across a few frames, which
// covers both a client-side navigation and a cold load on the hash.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** The booking modal owns #step-1 … #step-3; they are state, not places. */
const NOT_A_PLACE = /^#step/;

/** Frames to keep looking before giving up — ~half a second at 60fps. */
const MAX_FRAMES = 30;

export default function HashScroll() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash || NOT_A_PLACE.test(hash)) return;
    const id = decodeURIComponent(hash.slice(1));
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let frames = 0;
    let raf = 0;

    const look = () => {
      const el = document.getElementById(id);
      if (el) {
        // scroll-margin-top on [id] keeps the heading clear of the pill nav.
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        return;
      }
      if (frames++ < MAX_FRAMES) raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [pathname, hash]);

  return null;
}
