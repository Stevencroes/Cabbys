// §07 — the hero's ground: Aruba's west coast at night, drawn rather than
// photographed. The photograph it replaced was a black SUV outside a stone
// villa — handsome, and nothing in it said Aruba; it read as a car brand's
// page, not an island's transfer service. A licensed shot that does say
// Aruba would also be a 240KB LCP image; this is a few KB of SVG that paints
// with the first frame and scales to any screen without a soft edge.
//
// What is in it, back to front: the night sky, a low moon, the north end of
// the island on the horizon — the long flat coast with Hooiberg's cone above
// it, the one silhouette people recognise from the plane — and the moon's
// path broken up on the water. Every colour is a Night Sea token's value;
// nothing here is warm, and nothing teal, because teal is reserved for live
// state and a decorative use of it would teach the eye to ignore it.
//
// The scatter (stars, glints) comes from a seeded generator, computed once at
// module load, so the scene is identical on every render and on the server.

/** mulberry32 — small, fast, and deterministic for a given seed. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The viewBox. The moon sits at 72% across, which is the line the phone
// layout pins to the screen (see .hero-sea-pic in globals.css) — change one
// and change the other.
const W = 1600;
const H = 1000;
const HORIZON = 590;
const MOON = { x: 1152, y: 270, r: 30 };

const rand = seeded(20260904);

const STARS = Array.from({ length: 90 }, () => {
  const y = Math.pow(rand(), 1.4) * (HORIZON - 70);
  return {
    x: rand() * W,
    y,
    r: 0.5 + rand() * 0.9,
    // fewer and fainter towards the horizon, where real haze takes them
    o: (0.25 + rand() * 0.5) * (1 - y / HORIZON),
  };
});

/** The moon path. Rows run from the horizon to the foot of the frame on a
    power curve, so they bunch up in the distance the way waves do in
    perspective; the path widens and each glint lengthens towards the
    viewer, and the brightness falls away from the moon's axis. */
const GLINTS = Array.from({ length: 140 }, (_, i) => {
  const t = Math.pow(i / 139, 1.7);
  const y = HORIZON + 6 + t * (H - HORIZON - 6);
  const half = 14 + t * 300;
  const off = (rand() * 2 - 1) * half;
  const near = 1 - Math.abs(off) / half;
  return {
    x: MOON.x + off,
    y,
    len: 4 + t * 44 * (0.4 + rand()),
    w: 0.7 + t * 1.5,
    o: (0.18 + near * 0.62) * (1 - t * 0.55),
  };
});

export default function HeroSea() {
  return (
    <div className="hero-sea" aria-hidden="true">
      <div className="hero-sea-pic">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            {/* the sky lifts towards the horizon: night is darkest overhead */}
            <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#020B14" />
              <stop offset=".62" stopColor="#081A2A" />
              <stop offset="1" stopColor="#10283B" />
            </linearGradient>
            <linearGradient id="hs-sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0A1C2B" />
              <stop offset=".35" stopColor="#06121D" />
              <stop offset="1" stopColor="#020B14" />
            </linearGradient>
            <radialGradient id="hs-halo">
              <stop offset="0" stopColor="#D7D9D8" stopOpacity=".34" />
              <stop offset=".25" stopColor="#A7ADB4" stopOpacity=".12" />
              <stop offset="1" stopColor="#A7ADB4" stopOpacity="0" />
            </radialGradient>
            {/* a soft sheen on the water under the moon, under the glints */}
            <radialGradient id="hs-sheen" cx=".5" cy="0" r=".5">
              <stop offset="0" stopColor="#D7D9D8" stopOpacity=".16" />
              <stop offset="1" stopColor="#D7D9D8" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hs-horizon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#A7ADB4" stopOpacity="0" />
              <stop offset=".72" stopColor="#D7D9D8" stopOpacity=".55" />
              <stop offset="1" stopColor="#A7ADB4" stopOpacity=".1" />
            </linearGradient>
          </defs>

          <rect width={W} height={HORIZON} fill="url(#hs-sky)" />
          <g fill="#D7D9D8">
            {STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />)}
          </g>

          <circle cx={MOON.x} cy={MOON.y} r={MOON.r * 11} fill="url(#hs-halo)" />
          <circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill="#EFEDE9" />

          <rect y={HORIZON} width={W} height={H - HORIZON} fill="url(#hs-sea)" />
          {/* A rect from the horizon down, not an ellipse centred on it: an
              ellipse put its upper half in the sky as a pale dome. */}
          <rect x={MOON.x - 420} y={HORIZON} width="840" height="640" fill="url(#hs-sheen)" />

          {/* The island from the water off the west coast: the low coast,
              Hooiberg's cone rising from it, the coast running on. A shade lighter than the sea and darker
              than the sky behind it, so it reads as land at night. */}
          <path
            fill="#050F19"
            d={`M780 ${HORIZON} L780 ${HORIZON - 5} C860 ${HORIZON - 9} 960 ${HORIZON - 11} 1030 ${HORIZON - 12}
                C1130 ${HORIZON - 13} 1220 ${HORIZON - 14} 1290 ${HORIZON - 18}
                C1325 ${HORIZON - 22} 1350 ${HORIZON - 44} 1372 ${HORIZON - 58}
                C1380 ${HORIZON - 62} 1388 ${HORIZON - 62} 1396 ${HORIZON - 57}
                C1420 ${HORIZON - 42} 1446 ${HORIZON - 22} 1484 ${HORIZON - 17}
                C1530 ${HORIZON - 14} 1570 ${HORIZON - 13} 1600 ${HORIZON - 12} L1600 ${HORIZON} Z`}
          />
          <rect y={HORIZON - 0.5} width={W} height="1" fill="url(#hs-horizon)" />

          <g stroke="#D7D9D8" strokeLinecap="round">
            {GLINTS.map((g, i) => (
              <line key={i} x1={g.x - g.len / 2} y1={g.y} x2={g.x + g.len / 2} y2={g.y}
                strokeWidth={g.w} opacity={g.o} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
