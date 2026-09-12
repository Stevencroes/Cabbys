// Walking the weeks — the same control on the roster and on earnings.
//
// Both screens answer a question about one Monday-to-Sunday week, and a
// driver who has learned to step back a week on one of them has learned
// it on the other. It was worth extracting the moment the second screen
// needed it: two copies of a date stepper is two places for the arrows to
// drift apart, or for one of them to quietly stop at the current week.
import { addDays, todayInAruba, weekRangeLabel, weekStart } from "../lib/datetime";

interface WeekBarProps {
  /** any date inside the week on show */
  cursor: string;
  onChange: (day: string) => void;
}

export default function WeekBar({ cursor, onChange }: WeekBarProps) {
  const today = todayInAruba();
  const shown = weekStart(cursor);
  const current = weekStart(today);
  const where = shown === current ? "This week" : shown < current ? "Past week" : "Ahead";

  return (
    <div className="drv-weekbar">
      <button type="button" className="wnav" aria-label="Previous week" onClick={() => onChange(addDays(cursor, -7))}>‹</button>
      <div className="wlab">
        <span className="wr">{weekRangeLabel(cursor)}</span>
        <span className="wm">{where}</span>
      </div>
      <button type="button" className="wnav" aria-label="Next week" onClick={() => onChange(addDays(cursor, 7))}>›</button>
    </div>
  );
}
