// §08 — the hero booking card. One way or round trip above it, then one
// glass bar: pickup, drop-off, date, the hour, and the way on.
//
// It has two states, and the second is the point of this version. At rest
// it is a single line across the photograph. Touch any field and the same
// card opens IN PLACE into a panel: the field row stays where it is, and
// what the field needs — the island's places, the calendar, the hour — is
// laid out in the body underneath instead of hanging off the field as a
// 300px dropdown that ran off the bottom of a hero sitting low on the
// screen. On a phone the open card is the whole screen.
//
// It does not quote: the flow asks for availability first and shows money
// once the route is real, so the rate card is loaded by the flow that
// spends it rather than by the card that opens it. The party size went the
// same way — the flow's first step asks it beside the cars it decides, so
// the card no longer asks it a step early.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBooking } from "../../booking/BookingContext";
import PlaceCombobox from "./PlaceCombobox";
import DateField from "./DateField";
import TimeField from "./TimeField";
import { todayInAruba } from "../../lib/datetime";
import { isOnIsland, locate } from "../../lib/geo";
import { isTap } from "../../lib/tap";
import { lockBody, unlockBody } from "../../lib/bodyLock";
import { AIRPORT, AIRPORT_ID, selFromCustom, selFromPlace } from "../../data/places";
import { CARD_ID } from "../../booking/useStartBooking";

/** Where the open card stops being a panel in the hero and becomes the
    screen: a phone (the same 760px the place picker has always switched
    at), and any window too SHORT for the panel. Width alone let a laptop at
    600px tall, a tablet at 1024x600 and a phone on its side open a card
    that ran off the bottom of the screen with the calendar cut in half —
    the nav, the toggle and the field row left too little for a month.
    globals.css draws the two shapes this covers (§08, "the screen when
    open"); this is the same union, for the body lock and Hero's scroll. */
export const SHEET_QUERY = "(max-width: 760px), (max-height: 640px), (max-width: 1099px) and (max-height: 720px)";

/** Controls that SURVIVE the card closing. Focus resting on one of these
    can stay where it is; focus anywhere else in the card ("use my location",
    the calendar, the close button) is about to be unmounted with the body,
    and has to be handed somewhere first or it falls to <body>. */
const SURVIVES = 'input[role="combobox"], .dtf-trigger, .qbtn, .qmode button';

/** The open card's resting body: two lines and nothing else. No mark and
    no shortcut chips — with them the body read as a menu to pick from
    rather than a pause before you type, and the chips wrapped to three
    rows on a phone. Aruba only — the reference this layout came from
    claims sixty-four countries, and the one thing this card must never do
    is promise a service that is not there. "Anywhere on the island" is
    what the hero has always said. */
function Welcome({ lines }: { lines: [string, string] }) {
  return (
    <div className="qwelcome">
      <p className="qwelcome-t">{lines[0]}<br />{lines[1]}</p>
    </div>
  );
}

const PICKUP_LINES: [string, string] = ["Set your pickup anywhere on Aruba.", "We'll be there on time."];
const DROPOFF_LINES: [string, string] = ["Wherever you're headed on the island,", "we'll get you there on time."];

interface QuoteCardProps {
  /** told whenever the card opens or closes, so the hero can make room */
  onOpenChange?: (open: boolean) => void;
}

export default function QuoteCard({ onOpenChange }: QuoteCardProps) {
  const { state, setField, open } = useBooking();
  const [hint, setHint] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const onIsland = useMemo(() => isOnIsland(), []);
  const fromInput = useRef<HTMLInputElement | null>(null);
  const toInput = useRef<HTMLInputElement | null>(null);

  // ── open / closed ────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /** the field the card was last opened from — where focus goes back to */
  const lastCell = useRef<HTMLElement | null>(null);
  /** set while WE move focus, so handing it back does not reopen the card */
  const restoring = useRef(false);
  /** the open field's left edge, so its panel opens under it, not at x=0 */
  const [fieldX, setFieldX] = useState(0);
  /** whether the drop-off opened the card, so the body's words are about
      it — on a phone they are the only words, and said "pickup" under an
      open drop-off */
  const [toward, setToward] = useState(false);
  // The field row's height, so a picker's panel can span from the foot of
  // the row to the foot of the CARD rather than be a fixed --qbody-h tall.
  // Fixed, it stood at full height from the first frame while the card was
  // still growing to meet it, hung out of the bottom, and a Tab into it
  // scrolled the page to a panel the card had not reached yet.
  const headRef = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const measure = () => setHeadH(head.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);
  const bodyId = useId();
  /** a pointer is down on the row — its focus waits for the click */
  const pressing = useRef(false);

  useEffect(() => { onOpenChange?.(expanded); }, [expanded, onOpenChange]);

  /** Opened by a field, from any of the ways into one: focus (a tap, Tab,
      the validator), a click on a trigger that already has focus, and
      typing into a box that kept focus after Escape closed the card. */
  const expandFrom = useCallback((target: EventTarget | null) => {
    if (restoring.current) return;
    const cell = (target as HTMLElement | null)?.closest<HTMLElement>(".qf");
    if (!cell) return;
    lastCell.current = cell;
    setFieldX(cell.offsetLeft);
    setToward(cell.classList.contains("qf-to"));
    setExpanded(true);
  }, []);

  // ── why a press opens on CLICK, not on focus ──
  // Opening moves the field: the headline folds and the card rises, and on
  // a phone the card becomes the screen. Opened on the focus a press gives,
  // that move happened between pointerdown and pointerup, the release
  // landed on something else, and the browser sent the click to neither —
  // so the date and time pickers, which open on click, never opened. A
  // press now opens the card on its click, after the pickers have had it;
  // focus still opens it for Tab and for the validator's .focus().
  useEffect(() => {
    const reset = () => { pressing.current = false; };
    document.addEventListener("keydown", reset, true);
    return () => document.removeEventListener("keydown", reset, true);
  }, []);

  function onRowClick(e: React.MouseEvent) {
    pressing.current = false;
    const t = e.target as HTMLElement;
    // a click on a field's dead space — beside the time label, say — means
    // that field: hand it to the control, as a <label> would
    if (!t.closest("input, button, label, li, select, [role]")) {
      const control = t.closest(".qf")?.querySelector<HTMLElement>('input[role="combobox"], .dtf-trigger');
      control?.focus();
      control?.click();
    }
    expandFrom(t);
  }

  const collapse = useCallback(() => {
    const wrap = wrapRef.current;
    const active = document.activeElement as HTMLElement | null;
    setExpanded(false);
    if (!wrap || !active || !wrap.contains(active) || active.matches(SURVIVES)) return;
    // Focus is on something the close is about to remove. A date or time
    // trigger takes it back — focusing a button opens nothing. A place
    // field does not: focusing it opens its search (and on a phone raises
    // the keyboard), so the card itself takes focus instead, which keeps a
    // screen-reader user in the card they were working in.
    const trigger = lastCell.current?.querySelector<HTMLElement>(".dtf-trigger");
    restoring.current = true;
    (trigger ?? cardRef.current)?.focus({ preventScroll: true });
    restoring.current = false;
  }, []);

  // Close on a TAP outside, like the place picker: closing on pointerdown
  // shut the card the moment someone began to scroll the page past it.
  useEffect(() => {
    if (!expanded) return;
    let from: { x: number; y: number } | null = null;
    const at = (e: PointerEvent) => ({ x: e.clientX ?? 0, y: e.clientY ?? 0 });
    // started inside the card, it is not a tap outside it — see the same
    // guard in PlaceCombobox
    const onDown = (e: PointerEvent) => {
      from = wrapRef.current?.contains(e.target as Node) ? null : at(e);
    };
    const onCancel = () => { from = null; };
    const onUp = (e: PointerEvent) => {
      const start = from;
      from = null;
      if (!start || !isTap(start, at(e))) return;
      const t = e.target as Node;
      // a row that committed on this same pointerup has already left the
      // DOM — that is a choice made inside the card, not a tap outside it
      if (!t.isConnected) return;
      if (wrapRef.current && !wrapRef.current.contains(t)) collapse();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("pointerup", onUp);
    };
  }, [expanded, collapse]);

  // When the open card is the screen, the page under it must not
  // scroll — the same reference-counted lock the booking flow uses, so the
  // flow opening from this card hands the lock over rather than fighting
  // for it.
  useEffect(() => {
    if (!expanded || !window.matchMedia(SHEET_QUERY).matches) return;
    lockBody();
    // the field that opened the sheet goes to the top of it, so its list
    // has the room between it and the keyboard
    requestAnimationFrame(() => lastCell.current?.scrollIntoView?.({ block: "start" }));
    return () => unlockBody();
  }, [expanded]);

  function onKeyDown(e: React.KeyboardEvent) {
    // A picker that handled this Escape (closed its calendar, its list)
    // marks it handled; the card closes on the NEXT one. One key, one layer.
    if (e.key !== "Escape" || e.defaultPrevented || !expanded) return;
    e.preventDefault();
    collapse();
  }

  function onBlur(e: React.FocusEvent) {
    // Tabbing out of the card closes it. relatedTarget is null for a click
    // on nothing focusable — that is the outside-tap listener's call.
    const next = e.relatedTarget as Node | null;
    if (expanded && next && wrapRef.current && !wrapRef.current.contains(next)) setExpanded(false);
  }

  // ── the button's departure state ────────────────────────────────────
  // The press opens the flow immediately — there is no beat held here, and
  // nothing waits on an animation. The button simply carries a departed
  // state for as long as the overlay it opened is up: label receded, arrow
  // gone to the right. Not a spinner; nothing on this page loops.
  //
  // Read from the flow's own state rather than tracked beside it. A second
  // copy of "is the overlay open" is a copy that can be wrong — it would
  // have to be cleared on close, on unmount, and on every other route into
  // the flow (the nav's Book now opens it too), and any one of those missed
  // leaves the card's button stuck.
  const busy = state.open;

  // §3.8 — planning from abroad: pickup pre-fills to the airport; guests
  // already on the island get an empty form (they know where they are).
  useEffect(() => {
    if (!onIsland && !state.from) setField("from", selFromPlace(AIRPORT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLocate() {
    const res = await locate();
    setLocMsg(res.message);
    if (res.ok && res.area) {
      setField("from", selFromCustom(`Near ${res.area.name}`, res.area));
    } else {
      // off-island or denied — fall back kindly to the airport
      setField("from", selFromPlace(AIRPORT));
    }
  }

  // The card asks the ONE time question the route actually has. An airport
  // pickup is timed off the landing, a departure off the take-off, and the
  // driver's moment is worked out from there — so asking for a "pickup time"
  // on an airport run collects a number nothing uses and then asks for the
  // flight anyway. The flow downstream never asks the hour twice.
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  const when = fromAirport
    ? { label: "Flight lands", key: "flightLanding" as const, value: state.flightLanding }
    : toAirport
    ? { label: "Flight departs", key: "depTime" as const, value: state.depTime }
    : { label: "Pickup time", key: "pickupTime" as const, value: state.pickupTime };

  // Continue is never disabled — an empty field gets focus and a reason.
  // Focusing it is also what opens the card, so the reason is read with the
  // field's own panel already open under it.
  function handleContinue() {
    // The re-entry guard, rather than `disabled` on the button. Disabling a
    // control the moment it is pressed drops focus to the body, so a
    // keyboard user is left nowhere while the overlay mounts; aria-busy
    // says the same thing to a screen reader and costs nobody their place.
    if (busy) return; // the flow is already open — this press is a repeat
    if (!state.from) {
      setHint("Tell us where to pick you up first.");
      fromInput.current?.focus();
      return;
    }
    if (!state.to) {
      setHint("And where you're headed.");
      toInput.current?.focus();
      return;
    }
    if (state.from.id === state.to.id) {
      setHint("Pickup and drop-off are the same place — change one of them.");
      toInput.current?.focus();
      return;
    }
    if (!when.value) {
      setHint(fromAirport ? "When does your flight land? Set the hour, minutes and AM/PM."
        : toAirport ? "When does your flight leave? Set the hour, minutes and AM/PM."
        : "What time should the car be there? Set the hour, minutes and AM/PM.");
      document.getElementById("q-time")?.focus();
      return;
    }
    setHint("");
    setExpanded(false);
    open(); // everything already lives in context — nothing is asked twice
  }

  const locateBtn = onIsland ? (
    <button type="button" className="qloc" onClick={handleLocate}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="10" cy="10" r="3" /><path d="M10 2v3M10 15v3M2 10h3M15 10h3" />
      </svg>
      Use my location
    </button>
  ) : null;

  return (
    // Every "Book now" on the site lands here when it has no route to
    // open the flow with, so the card needs a name to be scrolled to.
    <div className={`quote rise${expanded ? " is-open" : ""}`} id={CARD_ID} ref={wrapRef}
      onKeyDown={onKeyDown} onBlur={onBlur}>
      <div className="qtop">
        {/* Two trips, both real: a return is priced and booked by the flow
            (TripSchedule asks its date). The reference's "By the hour" is
            not here because hourly hire is not a product — see Footer.tsx —
            and a mode the flow would refuse is not offered. Toggle buttons,
            not tabs: there is no tab panel, the pair sets one value. */}
        <div className="qmode" role="group" aria-label="Trip type" data-on={state.journey}>
          <span className="qmode-pill" aria-hidden="true" />
          <button type="button" aria-pressed={state.journey === "one"}
            onClick={() => setField("journey", "one")}>One way</button>
          <button type="button" aria-pressed={state.journey === "return"}
            onClick={() => setField("journey", "return")}>Round trip</button>
        </div>
        {expanded && (
          <button type="button" className="qclose" aria-controls={bodyId} aria-expanded="true"
            onClick={collapse}>
            <span>Close</span>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4 L14 14 M14 4 L4 14" />
            </svg>
          </button>
        )}
      </div>

      {/* tabIndex -1: the card takes focus back when the field that opened
          it cannot (see collapse) — never a Tab stop of its own. */}
      <div className={`qcard${expanded ? " is-open" : ""}`} ref={cardRef} tabIndex={-1}
        role="group" aria-label="Book a ride"
        style={{ "--qx": `${fieldX}px`, ...(headH ? { "--qhead-h": `${headH}px` } : null) } as React.CSSProperties}>
        <div className="qhead" ref={headRef}>
          <div className="qrow"
            // a field's press only: the button's press must not hold back
            // the focus its validator sends to the field it found empty
            onPointerDown={(e) => { pressing.current = !!(e.target as HTMLElement).closest(".qf"); }}
            onFocus={(e) => { if (!pressing.current) expandFrom(e.target); }}
            onClick={onRowClick}
            onInput={(e) => expandFrom(e.target)}>
            <div className="qf qf-from">
              <PlaceCombobox
                label="Pickup location"
                value={state.from}
                onSelect={(sel) => setField("from", sel)}
                placeholder={onIsland ? "Where are you now?" : "Airport, hotel, address…"}
                inputRef={fromInput}
                docked
                lead={<>
                  <Welcome lines={PICKUP_LINES} />
                  {locateBtn}
                </>}
              />
            </div>

            <div className="qf qf-to">
              <PlaceCombobox
                label="Drop-off location"
                value={state.to}
                onSelect={(sel) => setField("to", sel)}
                placeholder="Airport, hotel, address…"
                inputRef={toInput}
                docked
                lead={<Welcome lines={DROPOFF_LINES} />}
              />
            </div>

            <span className="qsep qsep-a" aria-hidden="true" />

            <div className="qf qf-date">
              <DateField
                id="q-date"
                label="Date"
                value={state.date}
                min={todayInAruba()}
                onChange={(iso) => setField("date", iso)}
                placeholder="Select a date"
                compact
                chevron
              />
            </div>

            {/* The hour, asked once, in the terms the route puts it in. */}
            <div className="qf qf-time">
              <TimeField
                id="q-time"
                label={when.label}
                value={when.value}
                onChange={(t) => setField(when.key, t)}
                placeholder="Select a time"
                hideZone
                chevron
              />
            </div>

            <span className="qsep qsep-b" aria-hidden="true" />

            <div className="qgo">
              <button type="button" className={`qbtn${busy ? " busy" : ""}`}
                aria-busy={busy} onClick={handleContinue}>
                <span className="qbtn-l">View options</span>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 10h13M11 5l5 5-5 5" />
                </svg>
              </button>
            </div>
          </div>

          {locMsg && <div className="qhint" role="status">{locMsg}</div>}
          {hint && <div className="qhint" role="alert">{hint}</div>}
        </div>

        {/* The open card's body. The pickers lay their panels over this
            box (see .qcard in globals.css); when none is open, this is what
            shows. The box stays so its height can animate, but it is a
            landmark, and has content, only while the card is open — a
            closed card has no "Trip details" region to announce. */}
        <div className="qbody" id={bodyId} role={expanded ? "region" : undefined}
          aria-label={expanded ? "Trip details" : undefined}>
          {expanded && <Welcome lines={toward ? DROPOFF_LINES : PICKUP_LINES} />}
        </div>
      </div>
    </div>
  );
}
