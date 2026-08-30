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
  AREAS, COMMON_PICKUPS, GROUPS, areaByName, displayName, searchPlaces, selFromCustom,
  selFromGeo, selFromPlace, type Place, type PlaceSel,
} from "../../data/places";
import { geoStatusLine, geocode, placesSearchEnabled, type GeoStatus, type GeoSuggestion } from "../../lib/places";
import { lockBody, unlockBody } from "../../lib/bodyLock";

/** Letters before the list appears. The picker suggests what you are
    typing; it does not open with all 62 places and ask you to scroll. */
const MIN_QUERY = 1;
/** Letters before "use this as an address" is worth offering. */
const MIN_CUSTOM = 4;
/** Letters before the island itself is searched. Two letters match half of
    Aruba and cost a request per keystroke to prove it. */
const MIN_GEO = 3;
/** Pause after the last keystroke before asking Mapbox. Short enough to
    feel like it is keeping up, long enough that typing a street name is
    one request rather than fourteen. */
const GEO_DEBOUNCE = 220;

interface PlaceComboboxProps {
  label: string;
  value: PlaceSel | null;
  onSelect: (sel: PlaceSel | null) => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** id of the error paragraph, so a screen reader reads the reason */
  describedBy?: string;
  invalid?: boolean;
  /** a mark before the value — the hero card sets a pin on FROM and TO */
  icon?: React.ReactNode;
}

interface Row {
  kind: "group" | "place" | "geo" | "custom";
  id: string;
  place?: Place;
  geo?: GeoSuggestion;
  group?: string;
  query?: string;
}

/** The line under a catalog place's name — where it is, in the same shape
    the geocoder answers in, so the two kinds of row read as one list. */
export function placeLine(p: Place): string {
  if (p.area === "Airport") return "AUA · Oranjestad, Aruba";
  const extra = p.meta && p.meta !== p.area ? ` · ${p.meta}` : "";
  return `${p.area}, Aruba${extra}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Rows for a query. Empty query means no rows — the "everything at once"
 * state is not reachable from here rather than merely unused.
 *
 * The catalog comes first and always will: those sixty places are the ones
 * with rate-card rows, and a hotel that prices from the live rate card must
 * never lose its own row to the geocoder's copy of it. Everything the
 * geocoder found that the catalog does not already have follows underneath.
 */
function buildRows(query: string, geo: GeoSuggestion[]): Row[] {
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

  // A geocoded row for a place already in the catalog is the same place
  // with a worse price attached — it would fall to the km model instead of
  // the rate card. Drop it and keep ours.
  const known = new Set(matches.map((p) => norm(p.name)));
  const extra = geo.filter((g) => !known.has(norm(g.name)));
  if (extra.length) {
    rows.push({ kind: "group", id: "g-geo", group: "Addresses & places" });
    for (const g of extra) rows.push({ kind: "geo", id: g.id, geo: g });
  }

  // The manual escape hatch, for when the island could not be searched at
  // all — no token, no network. With real results above it, it is a worse
  // answer offered next to better ones.
  if (q.length >= MIN_CUSTOM && !extra.length) rows.push({ kind: "custom", id: "custom", query: q });
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

/**
 * A mark for every result row.
 *
 * The old list had no icons on results on purpose — nineteen identical
 * building glyphs under a "Hotels & resorts" header is decoration. That
 * argument stops holding the moment the list mixes kinds: a hotel, a
 * street address and a district now sit in one column, and the glyph is
 * the fastest way to tell which is which before reading a word.
 */
const MARKS: Record<string, React.ReactNode> = {
  plane: <path d="M18 3 L2 10 L8 12 L10 18 Z" />,
  ship: <><path d="M10 6 V17 M6 9 H14 M4 12c0 3 3 5 6 5s6-2 6-5" /><circle cx="10" cy="4" r="2" /></>,
  hotel: <><path d="M4 18V4h9v14M13 9h3v9M4 18h14" /><path d="M7 7h3M7 10h3M7 13h3" /></>,
  waves: <><path d="M2 11q3-3 6 0t6 0" /><path d="M2 15q3-3 6 0t6 0" /></>,
  star: <path d="M10 3l2.1 4.5 4.9.6-3.6 3.4.9 4.9L10 14l-4.3 2.4.9-4.9L3 8.1l4.9-.6z" />,
  fork: <><path d="M6 3v6a2 2 0 0 0 4 0V3M8 9v8" /><path d="M14 3c-1.5 1-2 2.5-2 4s.7 2 2 2v8" /></>,
  bag: <><path d="M4 7h12l-1 10H5z" /><path d="M7.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>,
  pin: <><path d="M10 18s6-6.5 6-10a6 6 0 1 0-12 0c0 3.5 6 10 6 10z" /><circle cx="10" cy="8" r="2" /></>,
  road: <><path d="M7 3 5 17M13 3l2 14" /><path d="M10 4v2M10 9v2M10 14v2" /></>,
};

const GROUP_MARK: Record<string, string> = {
  "Airport & port": "plane",
  "Hotels & resorts": "hotel",
  "Beaches": "waves",
  "Sights & tours": "star",
  "Restaurants & bars": "fork",
  "Shopping": "bag",
  "Towns & areas": "pin",
};

function Mark({ name }: { name: string }) {
  return (
    <svg className="oicon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {MARKS[name] ?? MARKS.pin}
    </svg>
  );
}

/** The airport gets the plane whatever its group says; a geocoded row gets
    a mark for what Mapbox says it is. */
const markForPlace = (p: Place) =>
  p.id === "cruise-terminal" ? "ship" : GROUP_MARK[p.group] ?? "pin";
const markForGeo = (k: GeoSuggestion["kind"]) =>
  k === "poi" ? "hotel" : k === "address" ? "road" : "pin";

// Must match the sheet's own breakpoint in globals.css — the lock and the
// layout have to agree on what counts as a sheet.
const isSheet = () => window.matchMedia("(max-width:760px)").matches;

export default function PlaceCombobox({ label, value, onSelect, placeholder, inputRef, describedBy, invalid, icon }: PlaceComboboxProps) {
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
  // The field is one line about twenty-six characters wide. `name` is the
  // canonical string — the rate card's and the driver's — and for eight
  // places it does not fit, so the field shows the short form and the
  // dropdown, the review and the job sheet all still show the full one.
  const committed = value ? displayName(value) : "";
  // closeList can run from a document listener, outside React's render, and
  // must restore the CURRENT place rather than whichever one its closure was
  // built with
  const committedRef = useRef(committed);
  committedRef.current = committed;
  // the committed place owns the box whenever it changes underneath us —
  // a swap of pickup and drop-off, a preset, a clear
  useEffect(() => { setText(committed); setTyping(false); }, [committed]);

  const query = typing ? text : "";
  const q = query.trim();

  /**
   * The island, searched as you type.
   *
   * Debounced and abortable, and the abort matters twice over: it stops a
   * request per keystroke reaching Mapbox, and it stops a slow answer to
   * "man" landing on top of the answer to "manchebo" — the out-of-order
   * reply is the bug that makes a live search feel haunted.
   */
  const [geo, setGeo] = useState<GeoSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  // Why there is nothing, when there is nothing — see geoStatusLine. A
  // failed search and an unknown street used to look identical, to the
  // traveller and to whoever had to fix it.
  const [status, setStatus] = useState<{ s: GeoStatus; http?: number }>({ s: "ok" });
  useEffect(() => {
    if (!placesSearchEnabled) { setGeo([]); setSearching(false); setStatus({ s: "off" }); return; }
    if (q.length < MIN_GEO) { setGeo([]); setSearching(false); setStatus({ s: "ok" }); return; }
    const ctl = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      void geocode(q, ctl.signal).then((ans) => {
        if (ctl.signal.aborted) return;
        setGeo(ans.results);
        setStatus({ s: ans.status, http: ans.httpStatus });
        setSearching(false);
      });
    }, GEO_DEBOUNCE);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const rows = useMemo(() => buildRows(query, geo), [query, geo]);

  /**
   * Which way the panel opens, and how tall it may be.
   *
   * Two lines a row makes a list roughly twice as tall as the one that used
   * to hang here, and the card it hangs off sits low in a full-height hero
   * — so the results ran off the bottom of the screen and the ones worth
   * reading were the ones you could not see.
   *
   * Both halves matter. Flipping alone still overflows when neither side
   * has 420px; capping alone leaves a 60px list under a field near the
   * bottom. So: open toward the roomier side, then take no more room than
   * that side has. `max` is null in the sheet, where the list is the screen
   * and a measured height would fight the layout.
   */
  const [drop, setDrop] = useState<{ up: boolean; max: number | null }>({ up: false, max: null });
  const options = useMemo(() => rows.filter((r) => r.kind !== "group"), [rows]);
  // Geocoded rows land a beat after the catalog ones, so the highlight can
  // be pointing past the end of a list that just changed under it.
  const activeIdx = Math.min(active, Math.max(options.length - 1, 0));
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
    setText(p.short ?? p.name);
    setTyping(false);
    setOpen(false);
    setCustomQuery(null);
    if (lockedRef.current) { lockedRef.current = false; unlockBody(); }
  }
  /** A geocoded address commits like any other place. Its area — and so
      its fare — comes from its coordinates, not from a menu. */
  function commitGeo(g: GeoSuggestion) {
    onSelect(selFromGeo(g));
    setText(g.name);
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
      const row = options[activeIdx];
      if (!row) return;
      if (row.kind === "place" && row.place) commitPlace(row.place);
      else if (row.kind === "geo" && row.geo) commitGeo(row.geo);
      else if (row.kind === "custom") setCustomQuery(row.query ?? text.trim());
    }
  }

  useEffect(() => {
    if (!showList || isSheet()) { setDrop({ up: false, max: null }); return; }
    const measure = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const GAP = 10, EDGE = 16, WANT = 420, FLOOR = 220;
      const below = innerHeight - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const up = below < WANT && above > below;
      const room = up ? above : below;
      // A list shorter than a few rows is not worth flipping the world for,
      // so below the floor we let it overflow rather than shrink to nothing.
      setDrop({ up, max: Math.max(FLOOR, Math.min(WANT, Math.round(room))) });
    };
    measure();
    addEventListener("resize", measure);
    // capture: the page scrolls, but so can any container above this one
    addEventListener("scroll", measure, true);
    return () => {
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, true);
    };
  }, [showList]);

  // keep the active option visible under arrow-key travel
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-oid="${options[activeIdx]?.id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, options]);

  const activeId = options[activeIdx] ? `${uid}-opt-${options[activeIdx].id}` : undefined;
  const typedNothingFound = typing && q.length >= MIN_QUERY && options.length === 0 && !searching;

  return (
    <div className={`combo${open ? " open" : ""}`} ref={wrapRef}>
      <div className={`cfield${invalid ? " invalid" : ""}`}>
        <div className="cwrap">
          <label htmlFor={`${uid}-in`}>{label}</label>
          {/* the input always sits in .cin, with or without a mark, so the
              sheet's grid has one thing to place either way */}
          <span className="cin">
            {icon && <span className="cmark" aria-hidden="true">{icon}</span>}
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
            // the cell truncates a long address whatever we call it — hover
            // and the assistive-tech name both carry the whole thing
            title={!open && value ? value.name : undefined}
            value={text}
            onFocus={beginSearch}
            // committing keeps focus on the input, so a second tap raises no
            // focus event — without this the box would sit there inert
            onPointerDown={beginSearch}
            onChange={(e) => { setText(e.target.value); setTyping(true); openList(); setActive(0); setCustomQuery(null); }}
            onKeyDown={onKeyDown}
          />
          </span>
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
        <div
          className={`cpanel${drop.up ? " up" : ""}`}
          style={drop.max ? { maxHeight: drop.max } : undefined}
        >
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
                  className={`custom${oIdx === activeIdx ? " hl" : ""}`}
                  onPointerDown={(e) => { e.preventDefault(); setCustomQuery(row.query ?? text.trim()); }}
                >
                  <Mark name="road" />
                  <span className="otext">
                    <span className="on">Use “{row.query}” as an address</span>
                    <span className="oa">Airbnb, condo or villa — you pick the area</span>
                  </span>
                </li>
              );
            }
            if (row.kind === "geo") {
              const g = row.geo!;
              return (
                <li
                  key={row.id}
                  id={`${uid}-opt-${row.id}`}
                  data-oid={row.id}
                  role="option"
                  aria-selected={value?.id === g.id}
                  className={oIdx === activeIdx ? "hl" : ""}
                  onPointerDown={(e) => { e.preventDefault(); commitGeo(g); }}
                >
                  <Mark name={markForGeo(g.kind)} />
                  <span className="otext">
                    <span className="on"><Marked text={g.name} query={query} /></span>
                    <span className="oa">{g.address}</span>
                  </span>
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
                className={oIdx === activeIdx ? "hl" : ""}
                onPointerDown={(e) => { e.preventDefault(); commitPlace(p); }}
              >
                <Mark name={markForPlace(p)} />
                {/* Two lines, always: the name you are looking for, and
                    where it is. One line meant "Manchebo Beach Resort" and
                    "Eagle Beach" competed for the same row and the name
                    lost, three words deep, mid-wrap. */}
                <span className="otext">
                  <span className="on"><Marked text={p.name} query={query} /></span>
                  <span className="oa"><Marked text={placeLine(p)} query={query} /></span>
                </span>
              </li>
            );
          })}
          {searching && options.length === 0 && (
            <li className="cempty csearching" aria-live="polite">Searching Aruba…</li>
          )}
          {typedNothingFound && (
            <li className="cempty">
              Nothing on the island matches “{q}”.{" "}
              {q.length < MIN_CUSTOM
                ? "Keep typing — a few more letters and you can use it as your own address."
                : "Use it as your own address below."}
            </li>
          )}
        </ul>
        {/* Outside the scrolling list: a footer, not a row. As a sticky <li>
            it floated over the options and left a half-row visible beneath
            it, and a non-option <li> inside a listbox is a lie to a screen
            reader besides. */}
        {/* Always shown, because "the island was searched" and "the island
            could not be searched" are the two things a traveller staring at
            a short list most needs told apart. */}
        <div className={`cattrib${status.s === "ok" || status.s === "empty" ? "" : " cattrib-down"}`}>
          {searching && options.length > 0
            ? "Searching Aruba…"
            : geoStatusLine(status.s, status.http)}
        </div>
        </div>
      )}

      {/* The sheet takes the whole screen, so it cannot open on nothing.
          On the desktop dropdown this stays hidden — there, showing nothing
          IS the right answer until a letter is typed. */}
      {open && customQuery === null && !showList && (
        <div className="cpanel chint">
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
        <div className="cpanel">
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
