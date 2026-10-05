// One small moving proof per pillar in "Why Cabby's".
//
// The pillars were an icon, a title and a sentence each — four claims in a
// row, which the owner read as "too much text". A claim is easier to
// believe when you watch it happen, so each now has a few seconds of it
// happening, and the sentence under it got shorter.
//
// The same honesty rule as the step scenes (StepScenes.tsx): a tile shows
// nothing the pillar's own sentence does not promise. Two places it bites:
//   - "The price is the price" shows the price staying put while traffic
//     and a late flight go by. It does NOT draw a taxi meter climbing past
//     it: Cabby's is priced above the taxi tariff, so a chart implying the
//     meter ends up dearer would be a claim the fares do not back.
//   - The wait clock reads AIRPORT_FREE_WAIT_MINUTES, the same constant as
//     the pillar's sentence and the FAQ.
// Each plays once when the row arrives, and again when the pointer comes
// back to it — motion that answers the reader is welcome; motion that
// loops at them is not.
import { Fit, d } from "./fit";
import { AIRPORT_FREE_WAIT_MINUTES } from "../../lib/policy";

// Sized so the tile draws at 1:1 in a desktop column — the labels are set at
// --t-meta, the type floor, and only shrink below it on a narrow tablet.
export const PV_W = 220;
export const PV_H = 150;

const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.4,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

/* ── Private, start to finish ────────────────────────────────────────────
   A shuttle's route — round the houses, two strangers' stops — fades back,
   and yours draws straight across under it. */
const DIRECT = "M24 106 L196 106";
const DRIVE = "M30 106 L184 106"; // stops short of B so the car parks beside it, not on it
const SHUTTLE = "M24 106 C 38 52 70 38 82 60 S 112 116 136 66 S 182 34 196 106";

function Private() {
  return (
    <div className="pv pv-private">
      <svg width={PV_W} height={PV_H} viewBox={`0 0 ${PV_W} ${PV_H}`} aria-hidden="true">
        <g className="pv-shuttle a-recede" style={d(1300)}>
          <path d={SHUTTLE} className="pv-dash a-draw" pathLength={1} style={d(0)} />
          <circle cx="82" cy="60" r="4" className="pv-stop a-pop" style={d(520)} />
          <circle cx="136" cy="66" r="4" className="pv-stop a-pop" style={d(800)} />
        </g>
        <path d={DIRECT} className="pv-line a-draw" pathLength={1} style={d(1350)} />
        <circle cx="24" cy="106" r="5" className="pv-end" />
        <circle cx="196" cy="106" r="5" className="pv-end" />
      </svg>
      <span className="pv-tag pv-tag-mute a-recede-tag" style={{ left: 110, top: 10, ...d(1300) }}>Shuttle</span>
      <span className="pv-car a-drive-fast" style={{ offsetPath: `path("${DRIVE}")`, ...d(1350) }} />
      <span className="pv-tag a-rise" style={{ left: 110, top: 118, ...d(1900) }}>Just your group</span>
    </div>
  );
}

/* ── The price is the price ──────────────────────────────────────────────
   A flat line from Book to Arrive, the price locked on it. Traffic and a
   late flight drift in, reach the price, and go — it does not move. */
function Price() {
  return (
    <div className="pv pv-price">
      <div className="pv-lock a-rise" style={d(100)}>
        <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} strokeWidth={1.8} aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path className="a-latch" style={d(520)} d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        Price agreed
      </div>
      <svg width={PV_W} height={PV_H} viewBox={`0 0 ${PV_W} ${PV_H}`} aria-hidden="true">
        <path d="M26 96 L194 96" className="pv-line a-draw" pathLength={1} style={d(200)} />
        <path d="M26 90v12M194 90v12" className="pv-tick" />
      </svg>
      <span className="pv-axis" style={{ left: 26, top: 110 }}>Book</span>
      <span className="pv-axis pv-axis-r" style={{ left: 194, top: 110 }}>Arrive</span>
      <span className="pv-chip a-drift" style={{ left: 26, top: 58, ...d(900) }}>Traffic</span>
      <span className="pv-chip a-drift" style={{ left: 26, top: 58, ...d(1750) }}>Late flight</span>
    </div>
  );
}

/* ── There before you are ────────────────────────────────────────────────
   The flight followed in (the one live state here, so the one teal), then
   the free wait counted from the landing. */
const ARC = "M14 110 Q 70 12 126 110";

function Flight() {
  return (
    <div className="pv pv-flight">
      <div className="pv-live">
        <span className="pv-live-dot" />
        <span className="pv-live-a a-fade-out" style={d(1900)}>Tracking</span>
        <span className="pv-live-b a-fade-in" style={d(1950)}>Landed</span>
      </div>
      <svg width={PV_W} height={PV_H} viewBox={`0 0 ${PV_W} ${PV_H}`} aria-hidden="true">
        <path d={ARC} className="pv-dash pv-dash-faint" />
        <path d={ARC} className="pv-line a-draw-slow" pathLength={1} style={d(250)} />
        <circle cx="180" cy="76" r="27" className="pv-ring-track" />
        <circle cx="180" cy="76" r="27" className="pv-ring a-draw-slow" pathLength={1} style={d(2000)}
          transform="rotate(-90 180 76)" />
      </svg>
      <span className="pv-plane a-fly" style={{ offsetPath: `path("${ARC}")`, ...d(250) }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5Z" />
        </svg>
      </span>
      <span className="pv-axis pv-axis-c" style={{ left: 120, top: 122 }}>AUA</span>
      <span className="pv-wait a-rise" style={{ left: 180, top: 76, ...d(2000) }}>
        <b>{AIRPORT_FREE_WAIT_MINUTES}</b><small>min</small>
      </span>
      <span className="pv-axis pv-axis-c a-rise" style={{ left: 180, top: 122, ...d(2200) }}>free wait</span>
    </div>
  );
}

/* ── You know who's coming ───────────────────────────────────────────────
   The plate from the driver email, then the car pulling up wearing it. The
   plate is a sample, blanked the way the step scene blanks it. */
function Driver() {
  return (
    <div className="pv pv-driver">
      <div className="pv-mail a-rise" style={d(100)}>
        <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
          <rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.8 7 8.2 6 8.2-6" />
        </svg>
        <span>Plate</span>
        <b className="pv-plate">&#8226;&#8226;&#8226; &#8226;&#8226;&#8226;</b>
      </div>
      <div className="pv-front a-approach" style={d(700)}>
        <svg width="132" height="78" viewBox="0 0 132 78" {...stroke} aria-hidden="true">
          <path d="M14 46 24 18a8 8 0 0 1 7.5-5h69a8 8 0 0 1 7.5 5l10 28" />
          <path d="M30 20h72l7 22H23z" className="pv-glass" />
          <path d="M8 46h116a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V50a4 4 0 0 1 4-4Z" />
          <path d="M10 68v6h14v-6M108 68v6h14v-6" />
          <circle cx="22" cy="56" r="5" className="pv-lamp a-lamp" style={d(1500)} />
          <circle cx="110" cy="56" r="5" className="pv-lamp a-lamp" style={d(1500)} />
        </svg>
        <span className="pv-plate pv-plate-car">&#8226;&#8226;&#8226; &#8226;&#8226;&#8226;</span>
      </div>
      <span className="pv-match a-pop" style={d(1750)}>
        <svg width="12" height="12" viewBox="0 0 24 24" {...stroke} strokeWidth={2.4} aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
      </span>
    </div>
  );
}

export const PILLAR_VISUALS = [Private, Price, Flight, Driver];

export function PillarVisual({ index }: { index: number }) {
  const V = PILLAR_VISUALS[index];
  return (
    <div className="pvis" aria-hidden="true">
      <Fit w={PV_W} h={PV_H}><V /></Fit>
    </div>
  );
}
