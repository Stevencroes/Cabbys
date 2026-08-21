// The ride, drawn.
//
// Two states, both useful: with VITE_MAPBOX_TOKEN it is a real dark map
// with the driving line on it; without one it is a sketch of the island
// with the two ends marked. The sketch is not a placeholder waiting to be
// replaced — it is what every visitor sees until the token exists, so it
// has to be worth looking at.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlaceSel } from "../../data/places";
import {
  lastMapFailure, mapDebugOn, mapboxEnabled, onMapFailure, reportMapboxFailure,
} from "../../lib/mapbox";
import {
  coordOf, drivingRoute, islandPath, project, staticMapUrl,
  type Coord, type RouteLine,
} from "../../lib/route";

interface RouteMapProps {
  from: PlaceSel | null;
  to: PlaceSel | null;
  /** minutes from the pricing engine — exact, unlike anything on the map */
  minutes?: number | null;
  height?: number;
}

// kept at the frame's own ratio — `meet` letterboxes any mismatch, and
// an island drawn inside dead bars is not worth showing
const VB_W = 340;
const VB_H = 200;

/**
 * Widths are rounded up to a step so a scrollbar appearing does not buy a
 * second map. It also means every visitor at a given breakpoint asks for
 * the same URL, which Mapbox's CDN can then serve from cache.
 */
const WIDTH_STEP = 32;
const bucket = (w: number) => (w > 0 ? Math.ceil(w / WIDTH_STEP) * WIDTH_STEP : 0);

export default function RouteMap({ from, to, minutes, height = 208 }: RouteMapProps) {
  const a = coordOf(from);
  const b = coordOf(to);
  const [line, setLine] = useState<RouteLine | null>(null);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 0 until measured: rendering at a guessed width and then again at the
  // real one bought two static maps for every route drawn
  const [width, setWidth] = useState(0);
  // ?mapdebug=1 turns the caption into the reason. Off by default and off
  // for every visitor — a customer does not need to read our plumbing.
  const debug = mapDebugOn();
  const [why, setWhy] = useState(() => (debug ? lastMapFailure() : ""));
  useEffect(() => {
    if (!debug) return;
    setWhy(lastMapFailure());
    return onMapFailure(setWhy);
  }, [debug]);

  // Ask for the driving line only when there is a real journey to draw.
  useEffect(() => {
    setLine(null);
    setFailed(false);
    if (!a || !b || !mapboxEnabled) return;
    if (a.lat === b.lat && a.lon === b.lon) return;
    const ctl = new AbortController();
    void drivingRoute(a, b, ctl.signal).then((r) => { if (!ctl.signal.aborted) setLine(r); });
    return () => ctl.abort();
    // coordOf is derived from the ids, so those are the real inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id, to?.id]);

  // The static map is sized in pixels, so it has to know how wide it drew.
  // Layout effect, not effect: this runs before paint, so the first image
  // the browser fetches is already the right one.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setWidth(bucket(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = bucket(entry.contentRect.width);
      if (w > 0) setWidth((prev) => (w === prev ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!a || !b) {
    return (
      <div className="rmap-wrap">
        <div className="rmap rmap-empty" ref={boxRef} style={{ height }}>
          <Sketch a={null} b={null} />
          <p className="rmap-hint">Choose a route to see it drawn.</p>
          {debug && <span className="rmap-attr rmap-why">{why || "No failure recorded yet — pick a route."}</span>}
        </div>
      </div>
    );
  }

  const url = failed || width <= 0 ? null : staticMapUrl(a, b, line, { width, height, retina: true });
  const label = `${from?.name} to ${to?.name}`;

  return (
    <div className="rmap-wrap">
      <Ends from={from} to={to} />
      <div className="rmap" ref={boxRef} style={{ height }}>
      {url ? (
        <img className="rmap-img" src={url} alt={`Map of the route from ${label}`} width={width} height={height}
          onError={() => {
            // an <img> gives no status, so this only says which call died
            reportMapboxFailure("static image");
            setFailed(true);
          }} />
      ) : (
        <Sketch a={a} b={b} />
      )}

      {minutes ? <span className="rmap-dur">{minutes} min drive</span> : null}

      {/* Licence, not decoration — see staticMapUrl(). */}
      {url ? (
        <span className="rmap-attr">© Mapbox · © OpenStreetMap</span>
      ) : debug ? (
        <span className="rmap-attr rmap-why">{why || "Sketch — no failure recorded yet."}</span>
      ) : (
        <span className="rmap-attr">Sketch — not to scale</span>
      )}
      </div>
    </div>
  );
}

/** The two ends, named. Above the map, not on it — chips laid over the
    canvas sat exactly where the north-west pin lands. */
function Ends({ from, to }: { from: PlaceSel | null; to: PlaceSel | null }) {
  return (
    <div className="rmap-ends">
      <span className="rme"><i className="rme-a" aria-hidden="true" />{from?.name}</span>
      <span className="rme"><i className="rme-b" aria-hidden="true" />{to?.name}</span>
    </div>
  );
}

/** The island, its two ends, and the line between them. */
function Sketch({ a, b }: { a: Coord | null; b: Coord | null }) {
  const pa = a && project(a, VB_W, VB_H);
  const pb = b && project(b, VB_W, VB_H);
  return (
    <svg className="rmap-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className="rmap-land" d={islandPath(VB_W, VB_H)} />
      {pa && pb && (
        <path
          className="rmap-line"
          d={`M${pa.x} ${pa.y}Q${(pa.x + pb.x) / 2} ${(pa.y + pb.y) / 2 - 22} ${pb.x} ${pb.y}`}
        />
      )}
      {pa && <circle className="rmap-pin-a" cx={pa.x} cy={pa.y} r="5" />}
      {pb && <circle className="rmap-pin-b" cx={pb.x} cy={pb.y} r="5" />}
    </svg>
  );
}
