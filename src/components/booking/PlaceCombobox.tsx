// §3.3 — the place picker. A real combobox, not a 60-option <select>:
// type-to-filter across name AND area, grouped results, full keyboard
// support, pointerdown commits (fires before blur on touch), custom
// addresses anchored to a pricing area, and a full-screen sheet under
// 760px (which also solves stacking, keyboard overlap and scroll-trap).
//
// The box holds ONE string. It used to hold two — a `query` and the
// committed place's name, displayed as `query || value.name` — and the
// input showed whichever was truthy. Typing into a box that was showing
// the second one appended to it at the caret, so a picker sitting on
// "Queen Beatrix International Airport" turned into "Queen Beatrix
// palInternational Airport" the moment someone typed "pal", matched
// nothing, and offered the wreckage back as a custom address. One string,
// `text`, now backs the input, and `committed` flows into it.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AREAS, COMMON_PICKUPS, GROUPS, areaByName, searchPlaces, selFromCustom, selFromPlace,
  type Place, type PlaceSel,
} from "../../data/places";
import { lockBody, unlockBody } from "../../lib/bodyLock";

/** Letters before the list appears. The picker suggests what you are
    typing; it does not open with all 62 places and ask you to scroll. */
const MIN_QUERY = 1;
/** Letters before "use this as an address" is worth offering. */
const MIN_CUSTOM = 4;

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

/** Rows for a query. Empty query means no rows — the "everything at once"
    state is not reachable from here rather than merely unused. */
function buildRows(query: string): Row[] {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];
  const matches = searchPlaces(q);
  const rows: Row[] = [];
  for (const g of GROUPS) {
    const inGroup = matches.filter((p) => p.group === g);
    if (!inGroup.length) continue;
    rows.push({ kind: "group", id: `g-${g}`, group: g });
    for (const p of inGroup) rows.push({ kind: "place", id: p.id, place: p });
  }
  // villas, condos and Airbnbs are not in the list and never will be
  if (q.length >= MIN_CUSTOM) rows.push({ kind: "custom", id: "custom", query: q });
  return rows;
}

/** The run of text the query matched, so the eye can see why a row is
    here — "pal" should visibly be the "Pal" in Palm Beach. */
function Marked({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/** A mark for each shortcut row. These five are different KINDS of place —
    an airport, a port, two beaches, a town — so a glyph tells them apart at
    a glance. Deliberately not used on search results: nineteen identical
    building icons under a "Hotels & resorts" header would be decoration. */
function QuickIcon({ id }: { id: string }) {
  const d: Record<string, React.ReactNode> = {
    airport: <path d="M18 3 L2 10 L8 12 L10 18 Z" />,
    "cruise-terminal": <><path d="M10 6 V17 M6 9 H14 M4 12c0 3 3 5 6 5s6-2 6-5" /><circle cx="10" cy="4" r="2" /></>,
    "palm-beach": <><path d="M2 11q3-3 6 0t6 0" /><path d="M2 15q3-3 6 0t6 0" /></>,
    "eagle-beach": <><path d="M2 11q3-3 6 0t6 0" /><path d="M2 15q3-3 6 0t6 0" /></>,
    oranjestad: <><path d="M10 18s6-6.5 6-10a6 6 0 1 0-12 0c0 3.5 6 10 6 10z" /><circle cx="10" cy="8" r="2" /></>,
  };
  return (
    <svg className="qicon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d[id] ?? <><path d="M10 18s6-6.5 6-10a6 6 0 1 0-12 0c0 3.5 6 10 6 10z" /><circle cx="10" cy="8" r="2" /></>}
    </svg>
  );
}

// Must match the sheet's own breakpoint in globals.css — the lock and the
// layout have to agree on what counts as a sheet.
const isSheet = () => window.matchMedia("(max-width:760px)").matches;

export default function PlaceCombobox({ label, value, onSelect, placeholder, inputRef, describedBy, invalid }: PlaceComboboxProps) {
  const uid = useId();
  const listId = `${uid}-listbox`;
  const [open, setOpen] = useState(false);
  /** what the input shows — the only source of its value */
  const [text, setText] = useState("");
  /** true once this box has been edited, false while it just displays a
      committed place. Focus alone must not open a list. */
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(0);
  const [customQuery, setCustomQuery] = useState<string | null>(null);
  const [customArea, setCustomArea] = useState(AREAS[3].name); // Palm Beach default
  const [customNote, setCustomNote] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const ownInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lockedRef = useRef(false);

  const input = inputRef ?? ownInputRef;
  const committed = value ? value.name : "";
  // closeList can run from a document listener, outside React's render, and
  // must restore the CURRENT place rather than whichever one its closure was
  // built with
  const committedRef = useRef(committed);
  committedRef.current = committed;
  // the committed place owns the box whenever it changes underneath us —
  // a swap of pickup and drop-off, a preset, a clear
  useEffect(() => { setText(committed); setTyping(false); }, [committed]);

  const query = typing ? text : "";
  const rows = useMemo(() => buildRows(query), [query]);
  const options = useMemo(() => rows.filter((r) => r.kind !== "group"), [rows]);
  /** the list is a consequence of typing, never of focus */
  const showList = open && customQuery === null && typing && query.trim().length >= MIN_QUERY;

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
  /** Entering the box. A tap on a box that already holds a place means
      "change this", not "edit this" — nobody wants to insert letters into
      the middle of "Queen Beatrix International Airport". So the box
      empties and the place it held becomes the placeholder: the first
      keystroke starts a clean search, the name stays readable, and Cancel,
      Escape or a tap outside all put it back.

      Selecting the text instead would be the other convention, but a touch
      tap sets the caret after focus and drops the selection, which is how
      the appending bug survived being a "known pattern". */
  function beginSearch() {
    if (open) return;
    openList();
    if (committed) { setText(""); setTyping(true); }
  }
  /** Leaving without choosing restores the committed place. Abandoning a
      search must not strand half a word in a box whose selection still
      says something else. */
  function closeList() {
    setOpen(false);
    setCustomQuery(null);
    setTyping(false);
    setText(committedRef.current);
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
      const t = e.target as Node;
      // Committing runs on the row's own pointerdown, and React has flushed
      // the row out of the DOM by the time this document-level listener sees
      // the same event. A detached target is the row we just chose, not a
      // click somewhere else — closing on it would throw the choice away.
      if (!t.isConnected) return;
      if (wrapRef.current && !wrapRef.current.contains(t)) closeList();
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitPlace(p: Place) {
    onSelect(selFromPlace(p));
    setText(p.name);
    setTyping(false);
    setOpen(false);
    setCustomQuery(null);
    if (lockedRef.current) { lockedRef.current = false; unlockBody(); }
  }
  function commitCustom() {
    const area = areaByName(customArea) ?? AREAS[0];
    const name = customQuery ?? text.trim();
    onSelect(selFromCustom(name, area, customNote.trim()));
    setText(name);
    setTyping(false);
    setCustomNote("");
    setOpen(false);
    setCustomQuery(null);
    if (lockedRef.current) { lockedRef.current = false; unlockBody(); }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { closeList(); return; }
    if (!showList) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const row = options[active];
      if (!row) return;
      if (row.kind === "place" && row.place) commitPlace(row.place);
      else if (row.kind === "custom") setCustomQuery(row.query ?? text.trim());
    }
  }

  // keep the active option visible under arrow-key travel
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-oid="${options[active]?.id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, options]);

  const activeId = options[active] ? `${uid}-opt-${options[active].id}` : undefined;
  const typedNothingFound = typing && query.trim().length >= MIN_QUERY && options.length === 0;

  return (
    <div className={`combo${open ? " open" : ""}`} ref={wrapRef}>
      <div className={`cfield${invalid ? " invalid" : ""}`}>
        <div className="cwrap">
          <label htmlFor={`${uid}-in`}>{label}</label>
          <input
            id={`${uid}-in`}
            ref={input as React.RefObject<HTMLInputElement>}
            role="combobox"
            aria-expanded={showList}
            aria-controls={showList ? listId : undefined}
            aria-activedescendant={showList ? activeId : undefined}
            aria-autocomplete="list"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={open && committed ? committed : (placeholder ?? "Type a hotel, beach or address")}
            value={text}
            onFocus={beginSearch}
            // committing keeps focus on the input, so a second tap raises no
            // focus event — without this the box would sit there inert
            onPointerDown={beginSearch}
            onChange={(e) => { setText(e.target.value); setTyping(true); openList(); setActive(0); setCustomQuery(null); }}
            onKeyDown={onKeyDown}
          />
        </div>
        {value && !open && (
          <button type="button" className="clear" aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => { onSelect(null); setText(""); setTyping(false); input.current?.focus(); }}>
            ✕
          </button>
        )}
        {/* Wipes the search, not the selection — the sheet has no room for
            holding backspace down through "Queen Beatrix International
            Airport". Only while searching; the one above clears the field. */}
        {open && text.length > 0 && (
          <button type="button" className="cwipe" aria-label="Clear what you typed"
            onPointerDown={(e) => { e.preventDefault(); setText(""); setTyping(true); input.current?.focus(); }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4 L14 14 M14 4 L4 14" />
            </svg>
          </button>
        )}
        <button type="button" className="cancel" onPointerDown={(e) => { e.preventDefault(); closeList(); }}>
          Cancel
        </button>
      </div>

      {showList && (
        <ul className="clist" id={listId} role="listbox" aria-label={label} ref={listRef}>
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
                  onPointerDown={(e) => { e.preventDefault(); setCustomQuery(row.query ?? text.trim()); }}
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
                <span><Marked text={p.name} query={query} /></span>
                <span className="oarea">
                  {p.area === "Airport" ? "AUA" : <Marked text={p.area} query={query} />}
                </span>
              </li>
            );
          })}
          {typedNothingFound && (
            <li className="cempty">
              Nothing on the island matches “{query.trim()}”.{" "}
              {query.trim().length < MIN_CUSTOM
                ? "Keep typing — a few more letters and you can use it as your own address."
                : "Use it as your own address below."}
            </li>
          )}
        </ul>
      )}

      {/* The sheet takes the whole screen, so it cannot open on nothing.
          On the desktop dropdown this stays hidden — there, showing nothing
          IS the right answer until a letter is typed. */}
      {open && customQuery === null && !showList && (
        <div className="clist chint">
          <div className="cgroup">Common stops</div>
          <div className="cquick">
            {COMMON_PICKUPS.map((pl) => (
              <button key={pl.id} type="button"
                onPointerDown={(e) => { e.preventDefault(); commitPlace(pl); }}>
                <QuickIcon id={pl.id} />
                <span className="qn">{pl.name}</span>
                {/* the area only earns its column when it says something the
                    name does not — "Palm Beach · Palm Beach" is furniture */}
                {pl.area !== pl.name && (
                  <span className="oarea">{pl.area === "Airport" ? "AUA" : pl.area}</span>
                )}
              </button>
            ))}
          </div>
          <p>Somewhere else? Type it — an address prices by area, so villas and condos come out honest.</p>
        </div>
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
