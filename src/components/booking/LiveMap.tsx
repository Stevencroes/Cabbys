// The ride, drawn on a map you can actually move.
//
// The Maps JavaScript API is loaded on demand — the import is dynamic and
// only fires when a step that shows a map mounts. Until it resolves — and
// forever, if there is no key — RouteMap renders instead, which is a real
// map when a key exists and a drawn sketch of Aruba when it does not.
// Nobody waits on a blank rectangle.
import { useEffect, useRef, useState } from "react";
import type { PlaceSel } from "../../data/places";
import {
  buildLine, googleMapsEnabled, loadGoogleMaps, onGoogleAuthFailure, DARK_MAP_STYLE,
  reportGoogleMapsFailure,
} from "../../lib/googleMaps";
import { mapDebugOn, mapTrace, onMapTrace, traceMap } from "../../lib/mapDebug";
import RouteMap from "./RouteMap";
import { coordOf, drivingRoute, type RouteLine } from "../../lib/route";

interface LiveMapProps {
  from: PlaceSel | null;
  to: PlaceSel | null;
  minutes?: number | null;
  /** falls back to RouteMap at this height while the map loads or if it cannot */
  fallbackHeight?: number;
  /** floats the two end labels over the tiles, ride-hailing style. The
      sketch fallback draws its own strip instead — chips laid over a fixed
      drawing cover the pins, which is what fitBounds padding solves on a
      real map and cannot solve on a picture. */
  ends?: boolean;
}

const SILVER = "#B9C6D4";
const INK = "#F2F5F8";
const CENTER = { lat: 12.53, lng: -70.02 };

export default function LiveMap({ from, to, minutes, fallbackHeight = 260, ends }: LiveMapProps) {
  const holdRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<{ markers: google.maps.Marker[]; line: google.maps.Polyline | null }>({
    markers: [], line: null,
  });
  const [ready, setReady] = useState(false);
  const [dead, setDead] = useState(false);
  const [line, setLine] = useState<RouteLine | null>(null);

  const a = coordOf(from);
  const b = coordOf(to);

  // A key Google refuses does not throw — it paints Google's own white
  // "Oops! Something went wrong" card over the panel. Hearing about it is
  // what lets this hand over to the sketch instead, which is a drawn map
  // of the island with the route on it and is the honest thing to show.
  useEffect(() => onGoogleAuthFailure(() => {
    traceMap("AUTH REFUSED — handing over to the sketch");
    setReady(false);
    setDead(true);
  }), []);

  // The driving geometry. Same call the static map uses, and the same rule:
  // a null answer means draw what we can, never show an error.
  useEffect(() => {
    setLine(null);
    if (!a || !b || !googleMapsEnabled) return;
    const ctl = new AbortController();
    void drivingRoute(a, b, ctl.signal).then((r) => { if (!ctl.signal.aborted) setLine(r); });
    return () => ctl.abort();
    // coordOf is derived from the ids, so those are the real inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.id, to?.id]);

  // Build the map once, then keep it. Tearing it down per route change
  // would re-mount the whole thing every time somebody edits a field.
  useEffect(() => {
    if (!googleMapsEnabled || dead || mapRef.current || !holdRef.current) return;
    let cancelled = false;

    traceMap("loading Maps JavaScript API");
    void loadGoogleMaps().then((g) => {
      if (cancelled || !holdRef.current) {
        traceMap(cancelled ? "cancelled before construct" : "container gone");
        return;
      }
      traceMap("constructing map");
      const map = new g.maps.Map(holdRef.current, {
        center: CENTER,
        zoom: 10.2,
        styles: DARK_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        // requires two fingers to pan on a touchscreen and ctrl+scroll to
        // zoom on a trackpad — the same "cooperativeGestures" Mapbox had,
        // so scrolling the page past this panel never gets trapped by it
        gestureHandling: "cooperative",
        keyboardShortcuts: false,
      });
      // 'idle' — not 'tilesloaded' — is Google's "the first frame is on
      // screen" signal; it also re-fires after every fitBounds, which the
      // route/marker effect below relies on to know redraws finished.
      g.maps.event.addListenerOnce(map, "idle", () => {
        traceMap("LOADED — first idle");
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    }).catch((err) => {
      // A restricted or rejected key does not reject this promise — it
      // renders a grey, watermarked map instead and calls
      // window.gm_authFailure, wired in lib/googleMaps.ts, which reports
      // through the same channel this catch does. This catch is for
      // everything else: the script itself refused to load.
      traceMap(`FAILED to load: ${String(err).slice(0, 60)}`);
      reportGoogleMapsFailure("gl", undefined, err);
      if (!cancelled) setDead(true);
    });

    return () => {
      cancelled = true;
    };
  }, [dead]);

  // Route and pins, redrawn whenever either end moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    void loadGoogleMaps().then((g) => {
      const store = overlaysRef.current;
      store.markers.forEach((m) => m.setMap(null));
      store.line?.setMap(null);

      // decodePolyline, not the Maps JS "geometry" library: Google's Routes
      // API and the old Mapbox Directions API encode the same way, so the
      // one decoder this file already had needed no changes — and no
      // second library load just to draw a line already this reachable.
      const path = line
        ? decodePolyline(line.polyline).map(([lon, lat]) => new g.maps.LatLng(lat, lon))
        : a && b
        ? [new g.maps.LatLng(a.lat, a.lon), new g.maps.LatLng(b.lat, b.lon)]
        : [];
      const nextLine = path?.length
        ? new g.maps.Polyline({
            path, map,
            strokeColor: SILVER, strokeWeight: 4, strokeOpacity: 0.95,
          })
        : null;

      const nextMarkers: google.maps.Marker[] = [];
      if (a) nextMarkers.push(new g.maps.Marker({ position: { lat: a.lat, lng: a.lon }, map, icon: dot(INK) }));
      if (b) nextMarkers.push(new g.maps.Marker({ position: { lat: b.lat, lng: b.lon }, map, icon: dot(SILVER) }));
      overlaysRef.current = { markers: nextMarkers, line: nextLine };

      if (path && path.length > 1) {
        const bounds = new g.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        // heavier at the top: the end labels AND the duration sit up
        // there in one stack, and a route fitted under them is a route
        // half-covered. Bottom stays clear of Google's own two corners.
        map.fitBounds(bounds, { top: 132, bottom: 44, left: 44, right: 44 });
      }
    });
  }, [ready, line, a?.lat, a?.lon, b?.lat, b?.lon]);

  // No key, or the script refused to load: the drawn map is the whole answer.
  if (!googleMapsEnabled || dead) {
    return (
      <>
        <RouteMap from={from} to={to} minutes={minutes} height={fallbackHeight} />
        <MapTrace note={dead ? "gave up (dead)" : "no key in this build"} />
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
      {/* One stack in the top-left corner, ends and duration together.
          They used to sit in opposite corners, which put the duration on
          top of Google's logo — and that logo staying visible is a term
          of the licence, not a preference. Google owns the bottom-left
          (logo) and bottom-right (copyright); one group in the corner it
          does not use keeps clear of both without this file having to
          know how tall any of Google's own chrome is. */}
      {ready && (ends || minutes) ? (
        <div className="lmap-hud">
          {ends && (
            <>
              <span className="tme"><i className="tme-a" aria-hidden="true" />{from?.name}</span>
              <span className="tme"><i className="tme-b" aria-hidden="true" />{to?.name}</span>
            </>
          )}
          {minutes ? <span className="lmap-dur">{minutes} min drive</span> : null}
        </div>
      ) : null}
      <MapTrace note={ready ? "live" : "waiting for tiles"} />
    </div>
  );
}

/** A small filled circle, the same shape the sketch fallback uses for its
    pins, so the two maps agree on how an end is marked. */
function dot(color: string): google.maps.Symbol {
  return {
    path: "M0,0 m-6,0 a6,6 0 1,0 12,0 a6,6 0 1,0 -12,0",
    fillColor: color, fillOpacity: 1,
    strokeColor: "#0D1C29", strokeWeight: 2,
  };
}

/**
 * Under ?mapdebug=1 only: which build this is, what key it carries, and
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
 * Google's Routes API returns the route the same way the old Mapbox
 * Directions API did: an encoded polyline at precision 5, the "Encoded
 * Polyline Algorithm Format" both providers share. Decoding it here costs
 * a few lines and saves loading Maps JS's separate "geometry" library for
 * one function.
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
