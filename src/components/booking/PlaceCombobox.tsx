// §3.3 — the place picker. A real combobox, not a 60-option <select>:
// type-to-filter across name AND area, grouped results, full keyboard
// support, pointerdown commits (fires before blur on touch), custom
// addresses anchored to a pricing area, and a full-screen sheet under
// 760px (which also solves stacking, keyboard overlap and scroll-trap).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AREAS, GROUPS, PLACES, areaByName, searchPlaces, selFromCustom, selFromPlace,
  type Place, type PlaceSel,
} from "../../data/places";
import { lockBody, unlockBody } from "../../lib/bodyLock";

interface PlaceComboboxProps {
  label: string;
  value: PlaceSel | null;
  onSelect: (sel: PlaceSel | null) => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** id of the error paragraph, so a screen reader reads the reason */
  describedBy?: string;
  invalid?: boolean;
}

interface Row {
  kind: "group" | "place" | "custom";
  id: string;
  place?: Place;
  group?: string;
  query?: string;
}

function buildRows(query: string): Row[] {
  const q = query.trim();
  const matches = q ? searchPlaces(q) : PLACES;
  const rows: Row[] = [];
  for (const g of GROUPS) {
    const inGroup = matches.filter((p) => p.group === g);
    if (!inGroup.length) continue;
    rows.push({ kind: "group", id: `g-${g}`, group: g });
    for (const p of inGroup) rows.push({ kind: "place", id: p.id, place: p });
  }
  // ≥4 chars → offer the typed text as an address (villas, condos, Airbnbs)
  if (q.length >= 4) rows.push({ kind: "custom", id: "custom", query: q });
  return rows;
}

const isSheet = () => window.matchMedia("(max-width:760px)").matches;

export default function PlaceCombobox({ label, value, onSelect, placeholder, inputRef, describedBy, invalid }: PlaceComboboxProps) {
  const uid = useId();
  const listId = `${uid}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [customQuery, setCustomQuery] = useState<string | null>(null);
  const [customArea, setCustomArea] = useState(AREAS[3].name); // Palm Beach default
  const [customNote, setCustomNote] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lockedRef = useRef(false);

  const input = inputRef ?? ownInputRef;
  const rows = useMemo(() => buildRows(query), [query]);
  const options = useMemo(() => rows.filter((r) => r.kind !== "group"), [rows]);

  function openList() {
    if (!open) {
      setOpen(true);
      setActive(0);
      if (isSheet() && !lockedRef.current) {
        lockedRef.current = true;
        lockBody();
      }
    }
  }
  function closeList() {
    setOpen(false);
    setCustomQuery(null);
    if (lockedRef.current) {
      lockedRef.current = false;
      unlockBody();
    }
  }
  // never leave the body locked behind an unmounted picker
  useEffect(() => () => { if (lockedRef.current) unlockBody(); }, []);

  // close on outside pointerdown (desktop dropdown)
  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeList();
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitPlace(p: Place) {
    onSelect(selFromPlace(p));
    setQuery("");
    closeList();
  }
  function commitCustom() {
    const area = areaByName(customArea) ?? AREAS[0];
    onSelect(selFromCustom(customQuery ?? query.trim(), area, customNote.trim()));
    setQuery("");
    setCustomNote("");
    closeList();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { closeList(); return; }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { openList(); return; }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const row = options[active];
      if (!row) return;
      if (row.kind === "place" && row.place) commitPlace(row.place);
      else if (row.kind === "custom") setCustomQuery(row.query ?? query.trim());
    }
  }

  // keep the active option visible under arrow-key travel
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-oid="${options[active]?.id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, options]);

  const shown = query || (value ? value.name : "");
  const activeId = options[active] ? `${uid}-opt-${options[active].id}` : undefined;

  return (
    <div className={`combo${open ? " open" : ""}`} ref={wrapRef}>
      <div className={`cfield${invalid ? " invalid" : ""}`}>
        <div className="cwrap">
          <label htmlFor={`${uid}-in`}>{label}</label>
          <input
            id={`${uid}-in`}
            ref={input as React.RefObject<HTMLInputElement>}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? activeId : undefined}
            aria-autocomplete="list"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            placeholder={placeholder ?? "Type a hotel, beach or address"}
            value={shown}
            onFocus={openList}
            onChange={(e) => { setQuery(e.target.value); openList(); setActive(0); setCustomQuery(null); }}
            onKeyDown={onKeyDown}
          />
        </div>
        {value && !open && (
          <button type="button" className="clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onSelect(null); setQuery(""); }}>
            ✕
          </button>
        )}
        <button type="button" className="cancel" onPointerDown={(e) => { e.preventDefault(); closeList(); }}>
          Cancel
        </button>
      </div>

      {open && customQuery === null && (
        <ul className="clist" id={listId} role="listbox" ref={listRef}>
          {rows.map((row) => {
            if (row.kind === "group") {
              return <li key={row.id} className="cgroup" role="presentation">{row.group}</li>;
            }
            const oIdx = options.findIndex((o) => o.id === row.id);
            if (row.kind === "custom") {
              return (
                <li
                  key={row.id}
                  id={`${uid}-opt-${row.id}`}
                  data-oid={row.id}
                  role="option"
                  aria-selected={false}
                  className={`custom${oIdx === active ? " hl" : ""}`}
                  onPointerDown={(e) => { e.preventDefault(); setCustomQuery(row.query ?? query.trim()); }}
                >
                  <span>Use “{row.query}” as an address — Airbnb, condo, villa</span>
                </li>
              );
            }
            const p = row.place!;
            return (
              <li
                key={row.id}
                id={`${uid}-opt-${row.id}`}
                data-oid={row.id}
                role="option"
                aria-selected={value?.id === p.id}
                className={oIdx === active ? "hl" : ""}
                onPointerDown={(e) => { e.preventDefault(); commitPlace(p); }}
              >
                <span>{p.name}</span>
                <span className="oarea">{p.area === "Airport" ? "AUA" : p.area}</span>
              </li>
            );
          })}
          {options.length === 0 && <li className="cempty">Keep typing — or add it as an address once you've typed a few letters.</li>}
        </ul>
      )}

      {open && customQuery !== null && (
        <div className="clist">
          <div className="areasel">
            <label htmlFor={`${uid}-area`}>Which area is “{customQuery}” in? This sets your fare.</label>
            <select id={`${uid}-area`} value={customArea} onChange={(e) => setCustomArea(e.target.value as typeof customArea)}>
              {AREAS.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
            <div className="frow" style={{ gridTemplateColumns: "1fr" }}>
              <input
                type="text"
                placeholder="Directions for the driver — gate code, cross street"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
              />
            </div>
            <p className="as-note">Fixed fares are set by area, so villas and condos price honestly — no geocoding, no surprises.</p>
            <div className="frow" style={{ marginTop: 10 }}>
              <button type="button" className="btn back" onPointerDown={(e) => { e.preventDefault(); setCustomQuery(null); }}>Back</button>
              <button type="button" className="btn primary" onPointerDown={(e) => { e.preventDefault(); commitCustom(); }}>Use this address</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
