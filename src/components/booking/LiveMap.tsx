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
import { MAPBOX_TOKEN, mapboxEnabled } from "../../lib/mapbox";
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
        const gl = (await import("mapbox-gl")).default;
        await import("mapbox-gl/dist/mapbox-gl.css");
        if (cancelled || !holdRef.current) return;
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
        created.on("load", () => { if (!cancelled) setReady(true); });
        created.on("error", () => { if (!cancelled) setDead(true); });
        mapRef.current = created;
      } catch {
        if (!cancelled) setDead(true);
      }
    })();

    return () => {
      cancelled = true;
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
    return <RouteMap from={from} to={to} minutes={minutes} height={fallbackHeight} />;
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
    </div>
  );
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
