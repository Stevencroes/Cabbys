// A time picker that asks once.
//
// It used to be three selects — hour, minute, AM/PM — which is three
// decisions for one answer, and the minute list ran to sixty options.
// Then it was a grid split into bands. Now it is what people already know
// from every other booking site: one column of quarter-hours you scroll.
//
// The list runs in plain chronological order, midnight to a quarter to
// midnight, because a scroller only reads as a clock if it moves like one.
// Opening scrolls straight to the current answer, so the scroll is a nudge
// rather than a journey.
//
// The exact-time row underneath is not a nicety. A flight lands at 2:35,
// never at 2:30, so any picker that only offers the quarter-hours would
// make the arrival time wrong — and the whole pickup is derived from it.
//
// A partial answer still cannot escape: the list emits whole times, and
// the exact input emits "" until the browser has a complete one, which is
// what the step validators already refuse to advance on.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ARUBA_TZ_LABEL, formatTime, isHhmm } from "../../lib/datetime";

interface TimeFieldProps {
  id: string;
  label: string;
  value: string;                 // "HH:MM" (24h) or ""
  onChange: (hhmm: string) => void;
  describedBy?: string;
  invalid?: boolean;
  /** hides the AST caption where a nearby field already carries it */
  hideZone?: boolean;
  placeholder?: string;
}

const STEP_MINUTES = 15;
const SLOTS_PER_HOUR = 60 / STEP_MINUTES;

/** Every quarter hour of the day, as "HH:MM", in the order a clock runs. */
const SLOTS: string[] = Array.from({ length: 24 * SLOTS_PER_HOUR }, (_, i) => {
  const h = Math.floor(i / SLOTS_PER_HOUR);
  const m = (i % SLOTS_PER_HOUR) * STEP_MINUTES;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

/**
 * Where an empty picker opens. Not midnight: nobody scrolls up from 12 AM
 * by choice, and a list that opens on the small hours makes the common
 * answer the furthest away.
 */
const DEFAULT_ANCHOR = "08:00";

/** The slot the list should sit on — the answer, or the nearest one below it. */
function anchorOf(value: string): string {
  if (!value) return DEFAULT_ANCHOR;
  if (SLOTS.includes(value)) return value;
  // an exact time like 14:35 belongs beside 14:30
  const floor = value.slice(0, 3) + String(Math.floor(Number(value.slice(3)) / STEP_MINUTES) * STEP_MINUTES).padStart(2, "0");
  return SLOTS.includes(floor) ? floor : DEFAULT_ANCHOR;
}

export default function TimeField({
  id, label, value, onChange, describedBy, invalid, hideZone, placeholder = "Choose a time",
}: TimeFieldProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Centre the answer before paint, then take focus without letting the
  // browser scroll it to an edge — focus() alone lands the row flush against
  // the top or bottom of the scroller, which hides the times either side of
  // it and loses the whole point of a list you read around your choice.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-t="${anchorOf(value)}"]`);
    if (list && row) {
      list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2;
    }
    row?.focus({ preventScroll: true });
    // deliberately on open only: re-centring on every pick would yank the
    // list under the pointer between two adjacent times
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function commit(hhmm: string) {
    onChange(hhmm);
    close();
  }

  // one stop in the tab order, arrows move within — 96 tab stops is not a list
  const roving = anchorOf(value);

  function onListKey(e: React.KeyboardEvent) {
    const i = SLOTS.indexOf(roving);
    const to =
      e.key === "ArrowDown" ? i + 1 :
      e.key === "ArrowUp" ? i - 1 :
      e.key === "PageDown" ? Math.min(i + SLOTS_PER_HOUR * 3, SLOTS.length - 1) :
      e.key === "PageUp" ? Math.max(i - SLOTS_PER_HOUR * 3, 0) :
      e.key === "Home" ? 0 :
      e.key === "End" ? SLOTS.length - 1 : -1;
    if (to < 0 || to >= SLOTS.length || to === i) return;
    e.preventDefault();
    const el = listRef.current?.querySelector<HTMLElement>(`[data-t="${SLOTS[to]}"]`);
    el?.focus();
    el?.setAttribute("tabindex", "0");
  }

  const zoneId = `${uid}-zone`;
  const description = [describedBy, hideZone ? null : zoneId].filter(Boolean).join(" ") || undefined;
  const offGrid = !!value && !SLOTS.includes(value);

  return (
    <div className="timefield" ref={wrapRef}>
      <span className="dtf-label" id={`${uid}-label`}>{label}</span>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`dtf-trigger${value ? "" : " empty"}${invalid ? " invalid" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${uid}-label ${uid}-val`}
        aria-invalid={invalid || undefined}
        aria-describedby={description}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${uid}-val`}>{value ? formatTime(value) : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
      </button>

      {open && (
        <div
          className="dtf-pop tmf-pop"
          role="dialog"
          aria-label={label}
          onKeyDown={(e) => {
            // preventDefault marks it handled, which is how the booking
            // overlay knows not to treat this Escape as "close the flow"
            if (e.key !== "Escape") return;
            e.preventDefault();
            close();
          }}
        >
          <div
            className="tmf-list"
            ref={listRef}
            role="listbox"
            aria-label={`${label} — every 15 minutes`}
            onKeyDown={onListKey}
          >
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                role="option"
                data-t={s}
                tabIndex={s === roving ? 0 : -1}
                aria-selected={s === value}
                className={s === value ? "on" : ""}
                onClick={() => commit(s)}
              >
                {formatTime(s)}
              </button>
            ))}
          </div>

          <div className="tmf-exact">
            <label htmlFor={`${uid}-exact`}>
              Exact time <span className="soft">— to the minute</span>
            </label>
            <input
              id={`${uid}-exact`}
              type="time"
              step={60}
              value={isHhmm(value) ? value : ""}
              onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
            />
          </div>
        </div>
      )}

      {offGrid && !open && <span className="tmf-exactly">to the minute</span>}
      {!hideZone && <span className="tmf-zone" id={zoneId}>{ARUBA_TZ_LABEL}</span>}
    </div>
  );
}
