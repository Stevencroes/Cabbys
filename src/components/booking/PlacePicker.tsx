import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchPlaces, type Place } from "../../data/places";
import { geocode, mapboxEnabled, type GeoSuggestion } from "../../lib/mapbox";

interface PlacePickerProps {
  value: string;
  onPick: (name: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  ariaLabel?: string;
  /** "inline" strips the input chrome so it types directly inside a host row. */
  variant?: "default" | "inline";
}

// Curated quick-pick combobox. Suggestions only surface once the user starts
// typing — it searches the curated Aruba place list and, when a Mapbox token
// exists, merges live geocoder results (graceful no-op stub today).
export default function PlacePicker({
  value,
  onPick,
  onFocus,
  placeholder = "Search a place or address",
  autoFocus = false,
  id,
  ariaLabel,
  variant = "default",
}: PlacePickerProps) {
  const inline = variant === "inline";
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<GeoSuggestion[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Live Mapbox geocode — debounced + abortable so we don't fire per keystroke.
  useEffect(() => {
    if (!mapboxEnabled || !query.trim()) {
      setGeo([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      geocode(query, controller.signal).then((r) => setGeo(r)).catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const typing = query.trim().length > 0;
  const curated: Place[] = useMemo(() => (typing ? searchPlaces(query) : []), [typing, query]);

  function pick(name: string) {
    onPick(name);
    setQuery("");
    setOpen(false);
  }

  const hasResults = curated.length > 0 || geo.length > 0;
  // Suggestions appear only once the user starts typing — never on bare focus.
  const showPanel = open && typing;

  return (
    <div className={`pp${inline ? " pp-inline" : ""}`} ref={wrapRef}>
      <div className="pp-inputwrap">
        <input
          id={id}
          className={`pp-input${inline ? " pp-input-inline" : ""}`}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query || value}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocus?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) pick(query.trim());
            if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>

      {showPanel && (
        <div className="pp-panel" id={listboxId} role="listbox">
          <div className="pp-list">
            {/* curated Aruba POIs lead (richer than Mapbox here); live geocode results follow */}
            {curated.map((p) => (
              <button key={p.id} type="button" role="option" aria-selected={value === p.name} className="pp-opt" onClick={() => pick(p.name)}>
                <span className="pp-opt-name">{p.name}</span>
                {p.meta && <span className="pp-opt-meta">{p.meta}</span>}
              </button>
            ))}
            {geo.map((g) => (
              <button key={`geo-${g.id}`} type="button" role="option" aria-selected={false} className="pp-opt" onClick={() => pick(g.name)}>
                <span className="pp-opt-name">{g.name}</span>
                <span className="pp-opt-meta">{g.meta || "Aruba"}</span>
              </button>
            ))}
            {!hasResults && (
              <button type="button" role="option" aria-selected={false} className="pp-opt pp-opt-free" onClick={() => pick(query.trim())}>
                <span className="pp-opt-name">Use “{query.trim()}”</span>
                <span className="pp-opt-meta">Custom address</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
