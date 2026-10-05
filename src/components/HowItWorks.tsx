// §10 — the positioning section. Four pillars, each a few seconds of the
// claim happening above one short line saying it.
//
// The owner's note was "too much text". The four sentences were already
// one line each; what made the row read as text was that text was all it
// had — an icon, a title and a sentence, four times. The icons are gone and
// each pillar now carries a small moving proof (journey/PillarVisuals.tsx),
// so the row is looked at first and read second.
//
// The phone accordion went with them. It existed so four paragraphs would
// not stack into a wall; four tiles with one line each are a short stack,
// and a proof you have to open to see is a proof nobody sees.
import { useState } from "react";
import { SplitHeading } from "./motion";
import { PillarVisual } from "./journey/PillarVisuals";
import { reducedMotion } from "./journey/fit";
import { AIRPORT_FREE_WAIT_MINUTES } from "../lib/policy";

/* The four the brand actually rests on — private, fixed, on time, known
   driver — in the order a traveller worries about them. Every claim below
   is one the FAQ further down already stands behind.

   "There before you are" reads the waiting time from the same constant as
   the FAQ: the driver goes by the actual landing and waits
   AIRPORT_FREE_WAIT_MINUTES after it, free (src/lib/policy.ts). "You know
   who's coming" is the driver email (api/booking-alerts.ts,
   buildDriverEmail): name, car and plate, no photo, and no phone number —
   that is shown in My trips two hours before pickup instead. */
const PILLARS = [
  { title: "Private, start to finish", body: "Just your group. No sharing, no detours." },
  { title: "The price is the price", body: "Fixed when you book. Traffic or a late flight won't change it." },
  { title: "There before you are", body: `We follow your flight and wait up to ${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, free.` },
  { title: "You know who's coming", body: "Your driver's name, car and plate, by email before you travel." },
];

export default function HowItWorks() {
  // Bumping a tile's run remounts its visual, which restarts every
  // animation in it from the first frame — the replay on hover and focus.
  const [runs, setRuns] = useState<number[]>(() => PILLARS.map(() => 0));
  const replay = (i: number) => {
    if (reducedMotion()) return;
    setRuns((r) => r.map((n, j) => (j === i ? n + 1 : n)));
  };
  return (
    <section className="band" id="services">
      <div className="wrap">
        <div className="sec-head">
          <div className="eyebrow rise">Why Cabby's</div>
          <SplitHeading className="sec" parts={[{ text: "Nothing about this " }, { text: "should be a surprise.", em: true }]} />
        </div>

        <div className="pillars stagger">
          {PILLARS.map((p, i) => (
            <div className="pillar" key={p.title} onMouseEnter={() => replay(i)}>
              <PillarVisual key={runs[i]} index={i} />
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
