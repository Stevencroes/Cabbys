// Walking the periods — the same control on the roster and on earnings.
//
// Both screens answer a question about one stretch of the calendar, and a
// driver who has learned to step back on one of them has learned it on
// the other. It was worth extracting the moment the second screen needed
// it: two copies of a date stepper is two places for the arrows to drift
// apart, or for one of them to quietly stop at the current week.
//
// The roster only ever walks weeks. Earnings walks days, weeks or months
// depending on which scope is open — same arrows, same place, so the
// control does not move under the thumb when the scope changes.
import {
  addDays, addMonths, monthLabel, todayInAruba, weekRangeLabel, weekStart,
  formatDateShort,
} from "../lib/datetime";

export type Period = "day" | "week" | "month";

interface PeriodBarProps {
  /** any date inside the period on show */
  cursor: string;
  period?: Period;
  onChange: (day: string) => void;
}

/** "Today", "Yesterday", "Tomorrow", else "Fri 11 Sep". */
function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return formatDateShort(iso);
}

export default function PeriodBar({ cursor, period = "week", onChange }: PeriodBarProps) {
  const today = todayInAruba();
  const step = (n: number) => onChange(
    period === "month" ? addMonths(cursor, n) : addDays(cursor, n * (period === "week" ? 7 : 1)),
  );

  const label =
    period === "day" ? dayLabel(cursor, today)
    : period === "month" ? monthLabel(cursor)
    : weekRangeLabel(cursor);

  // Where this period sits relative to now, in one word. The comparison is
  // done on the period's own unit, so a Wednesday in the current week says
  // "This week" rather than "Past".
  const where = (() => {
    if (period === "day") return cursor === today ? "Today" : cursor < today ? "Past" : "Ahead";
    if (period === "month") {
      const a = cursor.slice(0, 7);
      const b = today.slice(0, 7);
      return a === b ? "This month" : a < b ? "Past month" : "Ahead";
    }
    const a = weekStart(cursor);
    const b = weekStart(today);
    return a === b ? "This week" : a < b ? "Past week" : "Ahead";
  })();

  const back = period === "month" ? "Previous month" : period === "day" ? "Previous day" : "Previous week";
  const on = period === "month" ? "Next month" : period === "day" ? "Next day" : "Next week";

  return (
    <div className="drv-weekbar">
      <button type="button" className="wnav" aria-label={back} onClick={() => step(-1)}>‹</button>
      <div className="wlab">
        <span className="wr">{label}</span>
        <span className="wm">{where}</span>
      </div>
      <button type="button" className="wnav" aria-label={on} onClick={() => step(1)}>›</button>
    </div>
  );
}
