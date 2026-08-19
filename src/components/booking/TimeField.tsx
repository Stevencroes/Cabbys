// A time picker that asks once.
//
// It used to be three selects — hour, minute, AM/PM — which is three
// decisions for one answer, and the minute list ran to sixty options.
// Now it is one trigger that opens a grid of quarter-hours: one tap for
// the times people actually book.
//
// The exact-time row underneath is not a nicety. A flight lands at 2:35,
// never at 2:30, so any picker that only offers the quarter-hours would
// make the arrival time wrong — and the whole pickup is derived from it.
//
// A partial answer still cannot escape: the grid emits whole times, and
// the exact input emits "" until the browser has a complete one, which is
// what the step validators already refuse to advance on.
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

/** Every quarter hour of the day, as "HH:MM". */
const SLOTS: string[] = Array.from({ length: 24 * SLOTS_PER_HOUR }, (_, i) => {
  const h = Math.floor(i / SLOTS_PER_HOUR);
  const m = (i % SLOTS_PER_HOUR) * STEP_MINUTES;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

const BANDS = [
  { label: "Morning", from: 5, to: 12 },
  { label: "Afternoon", from: 12, to: 17 },
  { label: "Evening", from: 17, to: 22 },
  { label: "Overnight", from: 22, to: 29 },   // wraps past midnight
] as const;

/** Which band a time belongs to, counting 00:00–04:45 as the small hours. */
function bandOf(hhmm: string): number {
  const h = Number(hhmm.slice(0, 2));
  const wrapped = h < 5 ? h + 24 : h;
  const i = BANDS.findIndex((b) => wrapped >= b.from && wrapped < b.to);
  return i === -1 ? 0 : i;
}

function slotsOfBand(i: number): string[] {
  return SLOTS.filter((s) => bandOf(s) === i).sort((a, b) => {
    // overnight runs 22:00 → 04:45, so sort it by the wrapped hour
    const w = (t: string) => (Number(t.slice(0, 2)) < 5 ? Number(t.slice(0, 2)) + 24 : Number(t.slice(0, 2))) * 60 + Number(t.slice(3));
    return w(a) - w(b);
  });
}

export default function TimeField({
  id, label, value, onChange, describedBy, invalid, hideZone, placeholder = "Choose a time",
}: TimeFieldProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [band, setBand] = useState(() => (value ? bandOf(value) : 0));
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // reopening lands on the band holding the current answer
  useEffect(() => {
    if (open && value) setBand(bandOf(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, [open, band]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function commit(hhmm: string) {
    onChange(hhmm);
    close();
  }

  const slots = useMemo(() => slotsOfBand(band), [band]);
  // one stop in the tab order, arrows move within — 96 tab stops is not a grid
  const roving = value && slots.includes(value) ? value : slots[0];

  function onGridKey(e: React.KeyboardEvent) {
    const cols = 4;
    const i = slots.indexOf(roving);
    const to =
      e.key === "ArrowRight" ? i + 1 :
      e.key === "ArrowLeft" ? i - 1 :
      e.key === "ArrowDown" ? i + cols :
      e.key === "ArrowUp" ? i - cols : -1;
    if (to < 0 || to >= slots.length) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      return;
    }
    e.preventDefault();
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-t="${slots[to]}"]`);
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
        <div className="dtf-pop tmf-pop" role="dialog" aria-label={label}>
          <div className="tmf-bands" role="tablist" aria-label="Part of day">
            {BANDS.map((b, i) => (
              <button
                key={b.label}
                type="button"
                role="tab"
                aria-selected={band === i}
                className={band === i ? "on" : ""}
                onClick={() => setBand(i)}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="tmf-grid" ref={gridRef} role="group" aria-label={`${BANDS[band].label} times`} onKeyDown={onGridKey}>
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                data-t={s}
                tabIndex={s === roving ? 0 : -1}
                aria-pressed={s === value}
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
