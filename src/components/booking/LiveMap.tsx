// The ride, drawn on a map you can actually move.
//
// Mapbox GL JS is 523 KB gzipped — more than three times the rest of this
// app put together — so it is never in the main bundle: the import is
// dynamic and only fires when a step that shows a map mounts. Until it
// resolves — and forever, if there is no token — RouteMap renders instead,
// which is a real map when a token exists and a drawn sketch of Aruba when
// it does not. Nobody waits on a blank rectangle.
import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { PlaceSel } from "../../data/places";
import {
  MAPBOX_TOKEN, buildLine, mapDebugOn, mapTrace, mapboxEnabled, onMapTrace,
  reportMapboxFailure, traceMap,
} from "../../lib/mapbox";
import RouteMap from "./RouteMap";
import { coordOf, drivingRoute, type RouteLine } from "../../lib/route";

interface LiveMapProps {
  from: PlaceSel | null;
  to: PlaceSel | null;
  minutes?: number | null;
  /** falls back to RouteMap at this height while GL loads or if it cannot */
  fallbackHeight?: number;
  /** floats the two end labels over the tiles, ride-hailing style. The
      sketch fallback draws its own strip instead — chips laid over a fixed
      drawing cover the pins, which is what fitBounds padding solves on a
      real map and cannot solve on a picture. */
  ends?: boolean;
}

const SILVER = "#B9C6D4";
const INK = "#F2F5F8";
const STYLE = "mapbox://styles/mapbox/dark-v11";

export default function LiveMap({ from, to, minutes, fallbackHeight = 260, ends }: LiveMapProps) {
  const holdRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [ready, setReady] = useState(false);
  const [dead, setDead] = useState(false);
  // A ref, not the `ready` state: the error handler is registered once and
  // closes over whatever it can see at that moment, which would be false
  // forever.
  const loadedRef = useRef(false);
  const [line, setLine] = useState<RouteLine | null>(null);

  const a = coordOf(from);
  const b = coordOf(to);

  // The driving geometry. Same call the static map uses, and the same rule:
  // a null answer means draw what we can, never show an error.
  useEffect(() => {
    setLine(null);
    if (!a || !b || !mapboxEnabled) return;
    const ctl = new AbortController();
    void drivingRoute(a, b, ctl.signal).then((r) => { if (!ctl.signal.aborted) setLine(r); });
    return () => ctl.abort();
    // coordOf is derived from the ids, so those are the real inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id, to?.id]);

  // Build the map once, then keep it. Tearing it down per route change
  // would re-bill a map load every time somebody edits a field.
  useEffect(() => {
    if (!mapboxEnabled || dead || mapRef.current || !holdRef.current) return;
    let cancelled = false;
    let created: MapboxMap | null = null;

    void (async () => {
      try {
        traceMap("importing mapbox-gl");
        const gl = (await import("mapbox-gl")).default;
        await import("mapbox-gl/dist/mapbox-gl.css");
        if (cancelled || !holdRef.current) {
          traceMap(cancelled ? "cancelled before construct" : "container gone");
          return;
        }
        traceMap(`constructing map (v${gl.version ?? "?"})`);
        gl.accessToken = MAPBOX_TOKEN as string;
        created = new gl.Map({
          container: holdRef.current,
          style: STYLE,
          center: [-70.02, 12.53],
          zoom: 10.2,
          attributionControl: true,
          // the panel is short and the route is the point — tilting it
          // only makes the line harder to follow
          pitchWithRotate: false,
          dragRotate: false,
          cooperativeGestures: true,
        });
        created.addControl(new gl.NavigationControl({ showCompass: false }), "bottom-right");
        created.on("load", () => {
          loadedRef.current = true;
          // GL measures its container once, when it is constructed. If the
          // panel had not settled by then the canvas is the wrong size —
          // and a canvas of the wrong size paints nothing at all, while
          // still reporting a perfectly successful load.
          created?.resize();
          const c = created?.getCanvas();
          traceMap(`LOADED — canvas ${c?.clientWidth ?? "?"}x${c?.clientHeight ?? "?"}`);
          if (!cancelled) setReady(true);
        });

        // A WebGL context can be taken away — too many live maps, a GPU
        // reset, a background tab reclaimed. It looks exactly like a blank
        // map, so name it rather than leaving it to be guessed at.
        created.on("webglcontextlost", () => traceMap("WEBGL CONTEXT LOST"));
        created.on("webglcontextrestored", () => {
          traceMap("webgl context restored");
          mapRef.current?.resize();
        });
        created.on("error", (e) => {
          const err = (e as { error?: { status?: number; message?: string } }).error;

          // A map that has already drawn stays drawn. GL reports plenty of
          // things through this one event that are not fatal — a tile that
          // 404s, a glyph range, a telemetry beacon an ad blocker refused —
          // and treating any of them as fatal tears down a working map a
          // second or two after it appears. Log it and carry on.
          if (loadedRef.current) {
            traceMap(`error after load, KEPT: ${(err?.message ?? "?").slice(0, 60)}`);
            console.warn("[map] non-fatal Mapbox error, map kept:", err?.message ?? err);
            return;
          }

          // Before the first load there is nothing to keep, but that is not
          // a reason to give up on anything that goes wrong: only a refused
          // token or a style that will not load makes a map impossible.
          // Anything else — a slow tile, one glyph range — is worth waiting
          // through, and waiting looks like the sketch, which is what would
          // be on screen anyway.
          if (!isFatal(err)) {
            traceMap(`error before load, waiting: ${(err?.message ?? "?").slice(0, 60)}`);
            console.warn("[map] Mapbox error before load, still waiting:", err?.message ?? err);
            return;
          }
          traceMap(`FATAL ${err?.status ?? ""} ${(err?.message ?? "?").slice(0, 50)}`);
          reportMapboxFailure("gl", err?.status, err?.message);
          if (!cancelled) setDead(true);
        });
        mapRef.current = created;
      } catch (err) {
        reportMapboxFailure("gl", undefined, err);
        if (!cancelled) setDead(true);
      }
    })();

    // Whatever the panel does after the map is built, the map follows it.
    // The rail is sticky and its neighbours change height as fields appear,
    // so "the size at construction time" is not a size worth trusting.
    const box = holdRef.current;
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          const m = mapRef.current;
          if (!m) return;
          m.resize();
          const c = m.getCanvas();
          traceMap(`resized to ${c.clientWidth}x${c.clientHeight}`);
        })
      : null;
    if (box && ro) ro.observe(box);

    return () => {
      cancelled = true;
      ro?.disconnect();
      // the one line that would explain a map vanishing without any error
      if (created) traceMap("TORN DOWN — effect cleanup ran");
      loadedRef.current = false;
      created?.remove();
      if (mapRef.current === created) mapRef.current = null;
    };
  }, [dead]);

  // Route and pins, redrawn whenever either end moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const src = map.getSource("route") as { setData?: (d: unknown) => void } | undefined;
    const geo = line ? decodePolyline(line.polyline) : (a && b ? [[a.lon, a.lat], [b.lon, b.lat]] as [number, number][] : []);
    const data = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: geo } };

    if (src?.setData) {
      src.setData(data);
    } else if (geo.length) {
      map.addSource("route", { type: "geojson", data: data as never });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": SILVER, "line-width": 4, "line-opacity": 0.95 },
      });
    }

    // Markers are recreated rather than moved: there are two of them, and
    // a stale marker on a changed route is worse than a cheap rebuild.
    void (async () => {
      const gl = (await import("mapbox-gl")).default;
      const store = markerStore.get(map) ?? [];
      store.forEach((m) => m.remove());
      const next: { remove: () => void }[] = [];
      if (a) next.push(new gl.Marker({ color: INK }).setLngLat([a.lon, a.lat]).addTo(map));
      if (b) next.push(new gl.Marker({ color: SILVER }).setLngLat([b.lon, b.lat]).addTo(map));
      markerStore.set(map, next);
    })();

    if (geo.length > 1) {
      const lons = geo.map((c) => c[0]);
      const lats = geo.map((c) => c[1]);
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        // heavier at the top: the two end labels sit up there, and a route
        // fitted under them is a route half-covered
        { padding: { top: 96, bottom: 44, left: 44, right: 44 }, duration: 600, maxZoom: 14 },
      );
    }
  }, [ready, line, a?.lat, a?.lon, b?.lat, b?.lon]);

  // No token, or GL refused to start: the drawn map is the whole answer.
  if (!mapboxEnabled || dead) {
    return (
      <>
        <RouteMap from={from} to={to} minutes={minutes} height={fallbackHeight} />
        <MapTrace note={dead ? "gave up (dead)" : "no token in this build"} />
      </>
    );
  }

  return (
    <div className="lmap">
      <div className="lmap-canvas" ref={holdRef} aria-hidden={!ready} />
      {!ready && (
        <div className="lmap-wait">
          <RouteMap from={from} to={to} minutes={minutes} height={fallbackHeight} />
        </div>
      )}
      {ready && ends && (
        <div className="tm-ends">
          <span className="tme"><i className="tme-a" aria-hidden="true" />{from?.name}</span>
          <span className="tme"><i className="tme-b" aria-hidden="true" />{to?.name}</span>
        </div>
      )}
      {ready && minutes ? <span className="lmap-dur">{minutes} min drive</span> : null}
      <MapTrace note={ready ? "live" : "waiting for tiles"} />
    </div>
  );
}

/**
 * Under ?mapdebug=1 only: which build this is, what token it carries, and
 * the ordered list of everything the map has done. A symptom like "it
 * renders and then disappears" is a sequence, and this is the sequence.
 */
function MapTrace({ note }: { note: string }) {
  const on = mapDebugOn();
  const [, bump] = useState(0);
  useEffect(() => {
    if (!on) return;
    return onMapTrace(() => bump((n) => n + 1));
  }, [on]);
  if (!on) return null;
  return (
    <div className="mtrace">
      <b>{buildLine()} · {note}</b>
      {mapTrace().map((line, i) => <span key={i}>{line}</span>)}
    </div>
  );
}

/**
 * Whether a Mapbox error means no map can be drawn at all.
 *
 * GL reports everything through one `error` event, so the question is not
 * "did something fail" but "did the thing that fails everything fail". A
 * refused token and a style that will not load are that; a tile is not.
 */
export function isFatal(err?: { status?: number; message?: string }): boolean {
  if (err?.status === 401 || err?.status === 403) return true;
  return /token|unauthorized|forbidden|style/i.test(err?.message ?? "");
}

/** Markers live outside React — one list per map instance. */
const markerStore = new WeakMap<MapboxMap, { remove: () => void }[]>();

/**
 * Mapbox returns the route as an encoded polyline at precision 5. Decoding
 * it here costs a few lines and saves asking for the GeoJSON variant, which
 * is several times the payload for the same shape.
 */
export function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = Math.pow(10, precision);
  const out: [number, number][] = [];
  let index = 0, lat = 0, lon = 0;

  while (index < str.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    out.push([lon / factor, lat / factor]);
  }
  return out;
}
