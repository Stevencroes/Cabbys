// The board's charts, drawn by hand.
//
// Inline SVG and plain React, not a chart library, and on purpose: the
// board needs five shapes (a tile, a donut, a ring, columns and a line),
// package.json carries no charting dependency, and the libraries that
// would draw these bring their own type, their own colours and their own
// tooltip — a second design language arriving in a bundle, which is the
// one thing a screen on this board may never do. Everything below reads
// the board's own tokens, so the charts change when the board does.
//
// The rules every chart here keeps, each one a fault it is written
// against:
//
//  · THREE STATES, NEVER TWO. Loading, failed and empty are three
//    different cards (Card). A chart whose query failed is not drawn
//    as a flat line at zero — a flat line is an answer, and "the read
//    failed" is not one. That is the same house rule Unreadable keeps for
//    tables, restated for something that draws.
//  · TEXT NEVER WEARS THE SERIES COLOUR. Values, ticks and legends are in
//    the board's ink; the colour sits on the mark beside them. The light
//    blue (--c-3) is under 3:1 against a white card, so it is legible only
//    as a fill with its number written next to it in ink, never as type.
//  · THE TOOLTIP ENHANCES, IT NEVER GATES. Every chart has a table view one
//    click away, and the donut's legend carries every number. Nothing on
//    this board is readable only by hovering.
//  · MARKS ARE THIN. Columns cap at 24px with a 4px rounded end and a
//    square foot on the baseline; lines are 2px; gridlines are solid
//    hairlines. A dashboard of thick saturated blocks reads as a toy.
//
// Colour follows the house rule, not a categorical wheel: only two
// colours on this board carry meaning — signal is live, alert is wrong —
// and the charts keep it. Harbour blue (--c-1) is the series itself, its
// lighter step (--c-3) is "booked, not yet driven", teal is a car on the
// road and clay is a ride nobody is driving. The tokens and the validator
// run behind them are in admin.css, under THE PAPER LAYER.
import {
  useId, useLayoutEffect, useRef, useState,
  type KeyboardEvent, type PointerEvent, type ReactNode,
} from "react";
import { usd } from "./lib/money";

/* ── shared pieces ───────────────────────────────────────────────────── */

/** The five chart colours, by role. Each maps to a --c-* token. */
export type Tone = "c1" | "c2" | "c3" | "c4" | "amber" | "purple" | "other";

/**
 * The width a chart actually has, so it can be drawn at that width.
 *
 * Not a viewBox scaled to fit. A scaled SVG scales its TEXT, and a tick
 * label set at 14px in a 640-unit viewBox renders at 9px in a 400px
 * card — the exact fault the type scale was written to end. Measuring
 * and drawing at 1:1 keeps every label on the scale at every width.
 *
 * jsdom has no layout and no ResizeObserver, so tests draw at the
 * fallback; the markup and the numbers are the same either way.
 */
function useWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A y-axis that lands on round numbers: 0 / 250 / 500, never 0 / 233 /
 * 466. Counts get whole steps, because a "2.5 rides" gridline is a
 * gridline nobody can read a ride off.
 */
export function niceScale(max: number, { integer = false, count = 4 } = {}): number[] {
  const peak = max > 0 ? max : 1;
  const raw = peak / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(peak / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** "$1,250" on an axis — the admin's own usd(), see lib/money.ts. */
export const usdTick = usd;
export const countTick = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * A column's top: a fully rounded data end, square on the baseline.
 *
 * The round end is the reference dashboard's pill-topped column (owner's
 * direction, October 2026), wider than the 4px the dataviz method sets
 * as its default; the foot stays square because a column grows from the
 * baseline, and a rounded foot makes it look like it is floating.
 */
function columnPath(x: number, y: number, w: number, h: number, round: boolean): string {
  if (h <= 0) return "";
  const r = round ? Math.min(w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}` +
    (r ? `Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}` : `H${x + w}`) +
    `V${y + h}Z`;
}

/** Approximate rendered width of a 14px Inter label, for spacing ticks. */
const textWidth = (s: string) => s.length * 7.6;

/* ── the card every chart sits in ────────────────────────────────────── */

export interface Failure {
  /** what could not be read, in the operator's words: "ride history" */
  what: string;
  /** the database's own message, for whoever fixes it */
  detail: string;
  onRetry?: () => void;
}

/**
 * A titled card that owns the three states.
 *
 * `wait` holds the card at the chart's own height so the grid does not
 * jump when the read lands. `fail` says the read failed and prints why.
 * `empty` says there is nothing to draw and what would put something
 * there. Only when none of the three applies are the children drawn —
 * so no chart below ever has to remember to check.
 *
 * `table` is the chart's twin: the same numbers as rows, one click away,
 * for a screen reader, a colour-blind reader, or anyone who wants the
 * figure rather than the shape.
 */
export function Card({
  title, sub, aside, wait, fail, empty, table, className, children, minHeight = 0,
}: {
  title: string;
  sub?: ReactNode;
  aside?: ReactNode;
  wait?: boolean;
  fail?: Failure | null;
  empty?: { line: string; hint?: ReactNode } | null;
  table?: () => ReactNode;
  className?: string;
  children?: ReactNode;
  /** the drawn chart's height, held while waiting so nothing reflows */
  minHeight?: number;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  const ready = !wait && !fail && !empty;
  return (
    <section className={`adm-card${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <div className="adm-cardh">
        <div className="adm-cardt">
          <h2 id={id}>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="adm-cardx">
          {aside}
          {ready && table && (
            <button
              type="button"
              className="adm-viewbtn"
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
            >
              {asTable ? "Chart" : "Table"}
            </button>
          )}
        </div>
      </div>
      {wait ? (
        <div className="adm-cwait" role="status" style={{ minHeight }}>
          <span className="adm-sr">Reading {title.toLowerCase()}.</span>
          <i aria-hidden="true" />
        </div>
      ) : fail ? (
        <div className="adm-cfail" role="alert" style={{ minHeight }}>
          <p className="es">Can't read the {fail.what}.</p>
          <p className="et">
            This chart isn't empty — the read behind it failed, so there's nothing honest to
            draw. Zero would be a wrong answer here, not a quiet one.
          </p>
          <p className="et mono">{fail.detail}</p>
          {fail.onRetry && (
            <button type="button" className="adm-btn" onClick={fail.onRetry}>Try again</button>
          )}
        </div>
      ) : empty ? (
        <div className="adm-cempty" style={{ minHeight }}>
          <p className="es">{empty.line}</p>
          {empty.hint && <p className="et">{empty.hint}</p>}
        </div>
      ) : asTable && table ? (
        <div className="adm-ctable">{table()}</div>
      ) : (
        children
      )}
    </section>
  );
}

/** A plain two-or-three column table, the twin every chart carries. */
export function MiniTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="adm-mini">
      <thead>
        <tr>{head.map((h, i) => <th key={h} scope="col" className={i ? "right" : ""}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "right" : ""}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── the stat tile ───────────────────────────────────────────────────── */

export interface Delta {
  /** a fraction: 0.12 is up twelve percent. Null when the previous
      period was zero and a percentage would be infinite. */
  change: number | null;
  /** what it is compared against, said in full: "the 7 days before" */
  against: string;
}

/**
 * One reading: a label, a number, and at most one line under it.
 *
 * The delta is the reference dashboard's: "↑ 8.2%" in green, "↓ 0.2%" in
 * red, then what it is compared against in grey. Green and red are the
 * owner's direction (October 2026) and replace the ink-only delta this
 * board first had. The colour is never alone: the arrow shows the
 * direction to an eye, and the word "Up" or "Down" is there for a
 * screen reader, which gets neither the glyph nor the colour.
 */
export function Tile({ label, value, icon, note, delta, alarm, wait, fail }: {
  label: string;
  value: string;
  icon?: ReactNode;
  note?: string;
  delta?: Delta | null;
  alarm?: boolean;
  /** the read behind this figure has not come back yet */
  wait?: boolean;
  /** the read behind this figure failed — said, never shown as a zero */
  fail?: string | null;
}) {
  return (
    <div className={`adm-tile${alarm ? " alarm" : ""}`}>
      <div className="adm-tilek">
        <span>{label}</span>
        {icon && <span className="ic" aria-hidden="true">{icon}</span>}
      </div>
      {wait ? (
        <div className="adm-tilev wait" role="status"><span className="adm-sr">Reading.</span><i aria-hidden="true" /></div>
      ) : fail ? (
        <>
          <div className="adm-tilev">—</div>
          <div className="adm-tilen bad">{fail}</div>
        </>
      ) : (
        <>
          <div className="adm-tilev">{value}</div>
          {delta && <DeltaLine d={delta} />}
          {note && <div className="adm-tilen">{note}</div>}
        </>
      )}
    </div>
  );
}

function DeltaLine({ d }: { d: Delta }) {
  if (d.change === null) {
    return <div className="adm-delta">Nothing to compare — {d.against} earned nothing</div>;
  }
  const pct = Math.round(Math.abs(d.change) * 100);
  if (pct === 0) return <div className="adm-delta">Level with {d.against}</div>;
  const up = d.change > 0;
  return (
    <div className={`adm-delta ${up ? "up" : "down"}`}>
      <b>
        <span className="ar" aria-hidden="true">{up ? "↑" : "↓"}</span>
        <span className="adm-sr">{up ? "Up" : "Down"} </span>
        {pct}%
      </b>
      vs {d.against}
    </div>
  );
}

/* ── the donut ───────────────────────────────────────────────────────── */

export interface Slice {
  key: string;
  label: string;
  value: number;
  tone: Tone;
}

/**
 * Part to whole, for five parts or fewer, with every number in the
 * legend beside it.
 *
 * A donut rather than a stacked bar because the question is "how is
 * today made up", read at a glance, and the parts are few and far
 * apart. The legend is what makes it a reading rather than a picture:
 * each row has the mark, the word, the count and the share, so the ring
 * is never the only place a number lives. Hovering a slice puts its
 * figure in the middle; moving off puts the total back.
 */
export function Donut({ slices, total, totalLabel, note, label }: {
  slices: Slice[];
  total: number;
  totalLabel: string;
  /** the grey line under the total, as the reference has under "4.890" */
  note?: string;
  /** what the whole donut is, for a screen reader */
  label: string;
}) {
  const [hot, setHot] = useState<string | null>(null);
  const size = 140;
  // the reference's ring is thick — about a third of its radius
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const drawn = slices.filter((s) => s.value > 0);
  // A 2px gap in the card's colour between touching slices, and none
  // when one slice is the whole ring — a gap there would be a crack.
  const gap = drawn.length > 1 ? 2 : 0;
  let at = 0;
  const active = slices.find((s) => s.key === hot) ?? null;

  return (
    <div className="adm-donutwrap">
    <div className="adm-donuthead">
      <b>{total} {totalLabel}</b>
      {note && <span>{note}</span>}
    </div>
    <div className="adm-donut">
      <div className="adm-donutfig">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
          <circle cx={size / 2} cy={size / 2} r={r} className="track" strokeWidth={stroke} fill="none" />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {drawn.map((s) => {
              const len = (s.value / total) * c;
              const dash = Math.max(len - gap, 0.75);
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  strokeWidth={hot === s.key ? stroke + 4 : stroke}
                  className={`seg t-${s.tone}${hot && hot !== s.key ? " dim" : ""}`}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-at}
                  onPointerEnter={() => setHot(s.key)}
                  onPointerLeave={() => setHot(null)}
                />
              );
              at += len;
              return el;
            })}
          </g>
        </svg>
        {/* empty, as the reference's is, until a slice is pointed at —
            the total already leads the card */}
        {active && (
          <div className="adm-donutc" aria-hidden="true">
            <b>{active.value}</b>
            <span>{active.label}</span>
          </div>
        )}
      </div>
      <ul className="adm-legend">
        {slices.map((s) => (
          <li
            key={s.key}
            className={hot === s.key ? "on" : ""}
            onPointerEnter={() => setHot(s.key)}
            onPointerLeave={() => setHot(null)}
          >
            <i className={`adm-sw t-${s.tone}`} aria-hidden="true" />
            <span className="pc">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            <span className="lb">{s.label}</span>
            <b className="vl">{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

/* ── the ring ────────────────────────────────────────────────────────── */

/**
 * One ratio against its whole: "5 of 8 driven". A meter, drawn round.
 * The unfilled track is a lighter step of the same ground, so the whole
 * circle reads as one instrument and the fill reads as how far along it
 * is. The fraction is said in words beside it, never left to the arc.
 */
export function Ring({ value, of, tone = "c1", label, figure, note }: {
  value: number;
  of: number;
  tone?: Tone;
  /** optional — inside a titled Card the title already says it */
  label?: string;
  figure: string;
  note?: string;
}) {
  const size = 64;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = of > 0 ? Math.min(1, value / of) : 0;
  const pct = Math.round(share * 100);
  return (
    <div className="adm-ring">
      <div className="adm-ringfig">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} className={`track t-${tone}`} strokeWidth={stroke} fill="none" />
          {share > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
              className={`seg t-${tone}`} strokeLinecap="round"
              strokeDasharray={`${share * c} ${c}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <span className="pc">{pct}%</span>
      </div>
      <div className="adm-ringt">
        {label && <div className="k">{label}</div>}
        <div className="v">{figure}</div>
        {note && <div className="n">{note}</div>}
      </div>
    </div>
  );
}

/* ── columns ─────────────────────────────────────────────────────────── */

export interface Column {
  key: string;
  /** the short label under the column */
  tick: string;
  /** the full label, for the tooltip and for a screen reader */
  label: string;
  segments: { name: string; value: number; tone: Tone }[];
  /** a period still filling — drawn lighter, and said */
  partial?: boolean;
}

/**
 * Columns from one baseline, stacked when there is more than one part.
 *
 * The hit target is the whole column of air above and around the bar,
 * not the painted pixels — a 4px bar on a quiet day is still easy to
 * land on. With `onSelect` each column is a real button (Earnings opens
 * a day out of its chart); without it each is a focusable reading, so a
 * keyboard gets the same tooltip a pointer does.
 *
 * One value is written on the chart: the tallest column's, on its cap.
 * Every value on every column is the clutter the axis and the tooltip
 * exist to replace.
 */
export function Columns({
  columns, format, tick = format, integer, height = 200, selected, onSelect, describe, track,
}: {
  columns: Column[];
  format: (n: number) => string;
  /** the axis's formatter, when it differs from the tooltip's */
  tick?: (n: number) => string;
  integer?: boolean;
  height?: number;
  selected?: string | null;
  onSelect?: (key: string) => void;
  /** the sentence a screen reader hears for one column */
  describe: (c: Column) => string;
  /** the reference's pale full-height track behind each column */
  track?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<number | null>(null);

  const sums = columns.map((c) => c.segments.reduce((a, s) => a + s.value, 0));
  const ticks = niceScale(Math.max(...sums, 0), { integer });
  const top = ticks[ticks.length - 1];
  const left = Math.max(...ticks.map((t) => textWidth(tick(t)))) + 12;
  const bottom = 30;
  const plotTop = 22;
  const plotH = height - bottom - plotTop;
  const plotW = Math.max(width - left - 4, 40);
  const band = plotW / Math.max(columns.length, 1);
  // thin, as the reference draws them: a column is a mark, not a block
  const barW = Math.min(14, Math.max(4, band * 0.42));
  const y = (v: number) => plotTop + plotH - (v / top) * plotH;
  // Tick labels thin out rather than collide: every k-th, always the last.
  const widest = Math.max(...columns.map((c) => textWidth(c.tick)), 1);
  const every = Math.max(1, Math.ceil((widest + 10) / band));
  const peak = sums.indexOf(Math.max(...sums));
  const tip = hot !== null ? columns[hot] : null;

  return (
    <div className={`adm-ch${selected ? " has-sel" : ""}`} ref={ref} style={{ height }}>
      <svg width={width} height={height} aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width} y1={y(t)} y2={y(t)} className={t === 0 ? "base" : "grid"} />
            <text x={left - 10} y={y(t)} dy="0.35em" textAnchor="end" className="tk">{tick(t)}</text>
          </g>
        ))}
        {columns.map((c, i) => {
          const cx = left + band * (i + 0.5);
          let base = y(0);
          const parts = c.segments.filter((s) => s.value > 0);
          return (
            <g
              key={c.key}
              className={`col${c.partial ? " partial" : ""}${hot === i ? " hot" : ""}${selected === c.key ? " sel" : ""}`}
            >
              {track && <path className="trk" d={columnPath(cx - barW / 2, plotTop, barW, plotH, true)} />}
              {parts.map((s, j) => {
                const h = (s.value / top) * plotH;
                // a 2px gap in the card colour between stacked parts
                const gapped = j > 0 ? 2 : 0;
                const yTop = base - h;
                const d = columnPath(cx - barW / 2, yTop, barW, Math.max(h - gapped, 0), j === parts.length - 1);
                base = yTop;
                return <path key={s.name} d={d} className={`t-${s.tone}`} />;
              })}
              {/* every k-th tick, and always the last — but never the one
                  before it when the two would touch */}
              {((i % every === 0 && columns.length - 1 - i >= every) || i === columns.length - 1) && (
                <text x={cx} y={height - 8} textAnchor="middle" className="tk">{c.tick}</text>
              )}
              {i === peak && sums[i] > 0 && (
                <text x={cx} y={y(sums[i]) - 8} textAnchor="middle" className="vl">{format(sums[i])}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="adm-hits" role={onSelect ? "group" : "list"}>
        {columns.map((c, i) => {
          const common = {
            className: "adm-hit",
            style: { left: left + band * i, width: band, top: plotTop - 4, height: plotH + 8 },
            "aria-label": describe(c),
            onPointerEnter: () => setHot(i),
            onPointerLeave: () => setHot(null),
            onFocus: () => setHot(i),
            onBlur: () => setHot(null),
          };
          return onSelect ? (
            <button key={c.key} {...common} type="button" aria-pressed={selected === c.key} onClick={() => onSelect(c.key)} />
          ) : (
            <span key={c.key} {...common} role="listitem" tabIndex={0} />
          );
        })}
      </div>
      {tip && hot !== null && (
        <Tip x={left + band * (hot + 0.5)} y={y(sums[hot])} width={width}>
          <span className="tl">{tip.label}{tip.partial ? " · so far" : ""}</span>
          {tip.segments.map((s) => (
            <span className="tr" key={s.name}>
              <i className={`t-${s.tone}`} aria-hidden="true" /><b>{format(s.value)}</b> {s.name}
            </span>
          ))}
        </Tip>
      )}
    </div>
  );
}

/** The floating readout. Values lead in ink; the series key is a short
    stroke of its colour, never a filled box and never coloured text. */
function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // kept inside the card: a tooltip that runs off the edge is clipped by
  // the card's own rounding
  const clamped = Math.min(Math.max(x, 90), width - 90);
  return (
    <div className="adm-tip" style={{ left: clamped, top: y }} aria-hidden="true">
      {children}
    </div>
  );
}

/* ── the line ────────────────────────────────────────────────────────── */

/**
 * A smooth path through every point that never overshoots them.
 *
 * The reference draws its line as a curve, and the owner asked for that
 * look. A plain Catmull-Rom or Bézier smoothing would bulge past a peak
 * and under a trough — a day with 2 rides drawn dipping toward 1 — which
 * is a chart inventing data. Monotone cubic interpolation (Fritsch and
 * Carlson) keeps the curve inside each pair of neighbouring values, so it
 * is smooth without saying anything the numbers do not.
 */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join("");
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

export interface Point {
  key: string;
  tick: string;
  label: string;
  value: number;
}

/**
 * One series over time, as a 2px line over a 10% wash.
 *
 * The crosshair finds the day: a hairline tracks the pointer and snaps
 * to the nearest point, so the reader aims at a date rather than at a
 * 2px line. Arrow keys walk the same crosshair for a keyboard. The last
 * point carries its own value at the end of the line — the one label
 * worth writing on a trend, because it is the one being asked about.
 */
export function Line({ points, format, integer, height = 200, label }: {
  points: Point[];
  format: (n: number) => string;
  integer?: boolean;
  height?: number;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<number | null>(null);
  const gradient = useId().replace(/:/g, "");

  const ticks = niceScale(Math.max(...points.map((p) => p.value), 0), { integer });
  const top = ticks[ticks.length - 1];
  const left = Math.max(...ticks.map((t) => textWidth(format(t)))) + 12;
  // room past the last point for its own value, written beside the dot
  // rather than over the line it ends
  const right = Math.max(...ticks.map((t) => textWidth(format(t)))) + 14;
  const bottom = 30;
  const plotTop = 22;
  const plotH = height - bottom - plotTop;
  const plotW = Math.max(width - left - right, 40);
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => left + step * i;
  const y = (v: number) => plotTop + plotH - (v / top) * plotH;
  const line = smoothPath(points.map((p, i) => [x(i), y(p.value)]));
  const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const widest = Math.max(...points.map((p) => textWidth(p.tick)), 1);
  const every = Math.max(1, Math.ceil((widest + 14) / Math.max(step, 1)));
  const last = points.length - 1;

  const nearest = (clientX: number, el: HTMLElement) => {
    const at = clientX - el.getBoundingClientRect().left - left;
    return Math.min(last, Math.max(0, Math.round(at / Math.max(step, 1))));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => setHot(nearest(e.clientX, e.currentTarget));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setHot((h) => Math.min(last, (h ?? -1) + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setHot((h) => Math.max(0, (h ?? last + 1) - 1)); }
    if (e.key === "Escape") setHot(null);
  };

  return (
    <div className="adm-ch" ref={ref} style={{ height }}>
      <svg width={width} height={height} aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="wash-a" />
            <stop offset="1" className="wash-b" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} className={t === 0 ? "base" : "grid"} />
            <text x={left - 10} y={y(t)} dy="0.35em" textAnchor="end" className="tk">{format(t)}</text>
          </g>
        ))}
        {points.map((p, i) =>
          (i % every === 0 && last - i >= every) || i === last ? (
            <text key={p.key} x={x(i)} y={height - 8} textAnchor="middle" className="tk">{p.tick}</text>
          ) : null,
        )}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} className="ln" />
        {hot !== null && (
          <line x1={x(hot)} x2={x(hot)} y1={plotTop} y2={y(0)} className="xh" />
        )}
        {last >= 0 && (
          <>
            <circle cx={x(last)} cy={y(points[last].value)} r={4} className="dot" />
            <text x={x(last) + 9} y={y(points[last].value)} dy="0.35em" className="vl">
              {format(points[last].value)}
            </text>
          </>
        )}
        {hot !== null && hot !== last && <circle cx={x(hot)} cy={y(points[hot].value)} r={4} className="dot" />}
      </svg>
      <div
        className="adm-scrub"
        style={{ left, width: plotW, top: plotTop - 4, height: plotH + 8 }}
        tabIndex={0}
        role="img"
        aria-label={`${label}. Use the arrow keys to read a day.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHot(null)}
        onKeyDown={onKey}
        onBlur={() => setHot(null)}
      />
      {hot !== null && points[hot] && (
        <Tip x={x(hot)} y={y(points[hot].value)} width={width}>
          <span className="tl">{points[hot].label}</span>
          <span className="tr"><i className="t-purple" aria-hidden="true" /><b>{format(points[hot].value)}</b></span>
        </Tip>
      )}
      {hot !== null && points[hot] && (
        <span className="adm-sr" aria-live="polite">{points[hot].label}: {format(points[hot].value)}</span>
      )}
    </div>
  );
}

/* ── icons for the tiles ─────────────────────────────────────────────── */
/* Drawn, not typed, for the reason the gate's marks are drawn: an emoji
   is the one thing guaranteed to arrive in somebody else's colours. */

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export const Icons = {
  car: icon(<><path d="M5 16V11.5L7 7h10l2 4.5V16" /><path d="M3.5 16h17" /><circle cx="7.5" cy="16.5" r="1.6" /><circle cx="16.5" cy="16.5" r="1.6" /></>),
  nobody: icon(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /><path d="M4 4l16 16" /></>),
  money: icon(<><rect x="3.5" y="6.5" width="17" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /></>),
  trend: icon(<><path d="M4 16.5l5-5 3.5 3.5L20 7.5" /><path d="M15 7.5h5v5" /></>),
};
