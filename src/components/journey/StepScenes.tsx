// The four scenes on the How it works stage — one per step, each a few
// seconds of the product doing the thing the step says.
//
// They are illustration, and aria-hidden: every fact a scene shows is also
// in the step's own text, which is what a screen reader reads. So a scene
// may never show something the text does not promise. Concretely:
//   - nothing here says "card" or shows a payment form. Nothing is charged
//     online (Landing.test pins the strip against it), so the Book scene
//     ends on "Due now $0.00" and the last scene on cash.
//   - the driver email carries name, car and plate — not a photo — so the
//     driver is a name and a plate, and the plate is shown blanked rather
//     than invented.
//   - the sign is at the airport, so the sign scene says Arrivals.
// The sample guest, driver and reference are plainly samples; the vehicle
// name is read from the fleet so it cannot drift from what is sold.
import { Fit, Typed, d } from "./fit";
import { VEHICLES } from "../../data/vehicles";

export const SCENE_W = 440;
export const SCENE_H = 340;

const SUV = VEHICLES.find((v) => v.id === "suv") ?? VEHICLES[0];

const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.4,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

function Glyph({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">{children}</svg>;
}
const Plane = () => <Glyph><path d="M2 13l9-3 4-7 2 1-2 6 5-1 2 2-8 4-2 6-2-1 0-5-6 2-1 2-2-1z" /></Glyph>;
const Bed = () => <Glyph><path d="M3 18v-6h18v6M3 12V8a2 2 0 0 1 2-2h5v6M21 12V8a2 2 0 0 0-2-2h-5M3 18v2M21 18v2" /></Glyph>;
const Mail = () => <Glyph><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.8 7 8.2 6 8.2-6" /></Glyph>;
const CarSide = () => (
  <Glyph size={18}>
    <path d="M3 15.5v-2.6l2.2-4.1A2 2 0 0 1 7 7.7h8.6a2 2 0 0 1 1.5.7l2.9 3.4 1 .5v3.2" />
    <path d="M3 15.5h1.6M9.4 15.5h5.2M19.4 15.5H21" /><circle cx="7" cy="15.8" r="1.9" /><circle cx="17" cy="15.8" r="1.9" />
  </Glyph>
);

/* ── 1 · Book ────────────────────────────────────────────────────────────
   The hero card, shrunk to a panel: route, car, the price locking, $0 due,
   and a pointer pressing Book. The press is the hand-off to scene 2. */
function SceneBook() {
  return (
    <div className="sc sc-book">
      <div className="mq a-rise">
        <div className="mq-route">
          <div className="mq-row a-rise" style={d(140)}>
            <span className="mq-ic"><Plane /></span>
            <span className="mq-k">From</span>
            <span className="mq-v">Queen Beatrix Airport</span>
          </div>
          <span className="mq-link a-grow" style={d(420)} />
          <div className="mq-row a-rise" style={d(300)}>
            <span className="mq-ic"><Bed /></span>
            <span className="mq-k">To</span>
            <span className="mq-v">Your hotel</span>
          </div>
        </div>
        <div className="mq-row mq-car a-rise" style={d(560)}>
          <span className="mq-ic"><CarSide /></span>
          <span className="mq-v">{SUV.name}</span>
          <span className="mq-meta">Up to {SUV.pax}</span>
        </div>
        <div className="mq-fare a-rise" style={d(760)}>
          <div className="mq-fixed">
            <span className="mq-k">Price</span>
            <span className="mq-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" {...stroke} strokeWidth={1.8} aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path className="mq-shackle a-latch" style={d(1050)} d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Fixed
            </span>
          </div>
          <div className="mq-due">
            <span className="mq-k">Due now</span>
            <span className="mq-sum">$0.00</span>
          </div>
        </div>
        <div className="mq-btn a-rise a-press" style={{ ...d(900), ["--dp" as string]: "2050ms" }}>
          <span className="mq-btn-a a-fade-out" style={d(2120)}>Book</span>
          <span className="mq-btn-b a-fade-in" style={d(2160)}>
            <Glyph size={15}><path d="M5 13l4 4L19 7" /></Glyph> Booked
          </span>
        </div>
      </div>
      <svg className="cursor a-cursor" style={d(1150)} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3.5 19 12l-6.2 1.6L9.6 20 5 3.5Z" fill="#F5F5F3" stroke="#020B14" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* ── 2 · Get confirmed ───────────────────────────────────────────────────
   A ring closes on a check; the email lands under it, a second notice
   settling behind for depth. */
function SceneConfirm() {
  return (
    <div className="sc sc-confirm">
      <svg className="cf-ring" width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r="36" className="cf-track" />
        <circle cx="38" cy="38" r="36" className="cf-arc a-draw" pathLength={1} style={d(120)} />
        <path d="M25 39.5l9 9 17-19" className="cf-tick a-draw" pathLength={1} style={d(640)} />
      </svg>
      <div className="cf-title a-rise" style={d(420)}>Booking confirmed</div>
      <div className="cf-stack">
        <div className="cf-note cf-ghost a-rise" style={d(980)} />
        <div className="cf-note a-drop" style={d(780)}>
          <span className="cf-ic"><Mail /></span>
          <div className="cf-body">
            <div className="cf-top"><b>Cabby's</b><span>now</span></div>
            <div className="cf-sub">Your transfer is confirmed</div>
            <div className="cf-ref">Ref <span>CB-7KM4Q</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 3 · Meet your driver ────────────────────────────────────────────────
   The driver email fills in, field by field; then the sign in arrivals,
   the guest's name lettered onto it. */
function SceneDriver() {
  return (
    <div className="sc sc-driver">
      <div className="dv-mail a-rise">
        <div className="dv-head">
          <span className="cf-ic"><Mail /></span>
          <b>Your driver</b>
          <span className="dv-from">Cabby's</span>
        </div>
        <div className="dv-rows">
          {[
            ["Name", <span key="n">Ricardo</span>],
            ["Car", <span key="c">{SUV.name}</span>],
            ["Plate", <span key="p" className="dv-plate">&#8226;&#8226;&#8226; &#8226;&#8226;&#8226;</span>],
          ].map(([k, v], i) => (
            <div className="dv-row" key={k as string}>
              <span className="dv-k">{k}</span>
              <span className="dv-v">
                <span className="dv-sk a-fade-out" style={d(520 + i * 260)} />
                <span className="dv-val a-fade-in" style={d(560 + i * 260)}>{v}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="dv-arrivals a-rise" style={d(1300)}>
        <Glyph size={14}><path d="M2 13l9-3 4-7 2 1-2 6 5-1 2 2-8 4-2 6-2-1 0-5-6 2-1 2-2-1z" /></Glyph>
        Arrivals
      </div>
      <div className="dv-sign a-hold" style={d(1420)}>
        <span className="dv-name"><Typed text="Ms. Laurent" start={1750} step={65} /></span>
        <span className="dv-caret a-caret" style={d(1750)} />
      </div>
    </div>
  );
}

/* ── 4 · Ride and pay ────────────────────────────────────────────────────
   Airport to hotel: the road drawn behind the car as it drives, then the
   fare settled in cash, either currency. */
const ROAD = "M46 176 C 128 176 140 92 222 96 S 330 64 392 52";

function SceneRide() {
  return (
    <div className="sc sc-ride">
      <div className="rd-map a-rise">
        <svg width={SCENE_W} height="236" viewBox={`0 0 ${SCENE_W} 236`} aria-hidden="true">
          <path d={ROAD} className="rd-ghost" />
          <path d={ROAD} className="rd-road a-draw-slow" pathLength={1} style={d(380)} />
        </svg>
        <span className="rd-pin rd-a" style={{ left: 46, top: 176 }}><Plane /></span>
        <span className="rd-lbl" style={{ left: 30, top: 200 }}>Airport</span>
        <span className="rd-pin rd-b a-arrive" style={{ left: 392, top: 52, ...d(2200) }}><Bed /></span>
        <span className="rd-lbl rd-lbl-b" style={{ left: 360, top: 14 }}>Hotel</span>
        <span className="rd-car a-drive" style={{ offsetPath: `path("${ROAD}")`, ...d(380) }} />
      </div>
      <div className="rd-paid a-rise" style={d(2300)}>
        <span className="rd-k">Paid in cash</span>
        <span className="rd-cur">
          <span className="a-pop" style={d(2500)}>USD</span>
          <span className="a-pop" style={d(2620)}>AWG</span>
        </span>
      </div>
    </div>
  );
}

export const SCENES = [SceneBook, SceneConfirm, SceneDriver, SceneRide];

/** One scene, scaled to its box. `play` is what starts its choreography;
    a scene that is not playing holds still and out of sight. */
export function StepScene({ index, play, className = "" }: { index: number; play: boolean; className?: string }) {
  const Scene = SCENES[index];
  return (
    <div className={`scene${play ? " sc-play" : ""} ${className}`.trim()} aria-hidden="true">
      <Fit w={SCENE_W} h={SCENE_H}>
        <Scene />
      </Fit>
    </div>
  );
}
