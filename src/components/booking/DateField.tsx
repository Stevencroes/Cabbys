// A date picker that reads the same to everyone.
// The trigger always shows "Fri 7 Aug 2026" — never 07/08/2026, which an
// American reads as 7 August and a Dutch guest as 7 August only by luck.
import { useEffect, useId, useRef, useState } from "react";
import {
  WEEKDAY_INITIALS, addDays, addMonths, dayOfMonth, formatDate, formatDateShort,
  monthGrid, monthLabel, sameMonth, todayInAruba,
} from "../../lib/datetime";

interface DateFieldProps {
  id: string;
  label: string;
  value: string;                 // ISO "YYYY-MM-DD" or ""
  onChange: (iso: string) => void;
  /** earliest selectable date, ISO; defaults to today on the island */
  min?: string;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  /** drops the year from the trigger — for narrow cards where the full
      date wraps to two lines. The year is still in the popover. */
  compact?: boolean;
}

export default function DateField({
  id, label, value, onChange, min, placeholder = "Choose a date", describedBy, invalid, compact,
}: DateFieldProps) {
  const uid = useId();
  const gridId = `${uid}-grid`;
  const floor = min || todayInAruba();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value || floor);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // reopening starts from what's chosen (or the earliest allowed day)
  useEffect(() => {
    if (open) setCursor(value || floor);
  }, [open, value, floor]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // move focus into the grid so arrow keys work immediately
  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, [open]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function commit(iso: string) {
    if (iso < floor) return;
    onChange(iso);
    close();
  }

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    };
    if (e.key in moves) {
      e.preventDefault();
      setCursor((c) => {
        const next = addDays(c, moves[e.key]);
        return next < floor ? c : next;
      });
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setCursor((c) => { const n = addMonths(c, -1); return n < floor ? floor : n; });
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setCursor((c) => addMonths(c, 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor((c) => { const n = addDays(c, -(new Date(`${c}T12:00:00Z`).getUTCDay())); return n < floor ? floor : n; });
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor((c) => addDays(c, 6 - new Date(`${c}T12:00:00Z`).getUTCDay()));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  // keep the focused day focused as the cursor travels
  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, [cursor, open]);

  const days = monthGrid(cursor);
  const canGoBack = !sameMonth(cursor, floor) && cursor > floor;

  return (
    <div className="datefield" ref={wrapRef}>
      <label className="dtf-label" htmlFor={id}>{label}</label>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`dtf-trigger${value ? "" : " empty"}${invalid ? " invalid" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value ? (compact ? formatDateShort(value) : formatDate(value)) : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div className="dtf-pop" role="dialog" aria-label={`${label} — choose a date`}>
          <div className="dtf-head">
            <button
              type="button"
              className="dtf-nav"
              aria-label="Previous month"
              disabled={!canGoBack}
              onClick={() => setCursor((c) => { const n = addMonths(c, -1); return n < floor ? floor : n; })}
            >
              ‹
            </button>
            <span className="dtf-month" aria-live="polite">{monthLabel(cursor)}</span>
            <button
              type="button"
              className="dtf-nav"
              aria-label="Next month"
              onClick={() => setCursor((c) => addMonths(c, 1))}
            >
              ›
            </button>
          </div>

          <div className="dtf-dow" aria-hidden="true">
            {WEEKDAY_INITIALS.map((d) => <span key={d}>{d}</span>)}
          </div>

          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
          <div
            className="dtf-grid"
            id={gridId}
            role="grid"
            ref={gridRef}
            onKeyDown={onGridKey}
          >
            {days.map((iso) => {
              const outside = !sameMonth(iso, cursor);
              const disabled = iso < floor;
              const selected = iso === value;
              const focused = iso === cursor;
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={formatDate(iso)}
                  disabled={disabled}
                  tabIndex={focused ? 0 : -1}
                  className={`dtf-day${outside ? " out" : ""}${selected ? " sel" : ""}${focused ? " cur" : ""}`}
                  onClick={() => commit(iso)}
                >
                  {dayOfMonth(iso)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
