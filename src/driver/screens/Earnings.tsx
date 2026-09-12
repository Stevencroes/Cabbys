// Earnings — the screen that decides whether a driver trusts you.
//
// It's the second-most-opened screen in any driver app, so vagueness here
// costs drivers faster than anything else. Two rules follow from that, and
// both were broken:
//
//  · Every figure has to be checkable. A week's total a driver cannot take
//    apart is a number they have to take on faith, and drivers who take
//    money on faith stop driving for you. The bars were aria-hidden
//    decoration; now each one is a day you can open, down to the rides that
//    made it.
//  · Nothing may be stated that isn't known. "Next payout $340 · Monday"
//    was invented — there is no payout table, no paid flag, and no
//    confirmed schedule. It also summed the CURRENT week, which on a
//    Wednesday is not what Monday would pay even if the schedule were real.
//
// Everything sums completed work only, bucketed by completed_at — a job
// booked Friday and driven Saturday is Saturday's.
//
// And it is ANY week, not just this one. The screen used to compute
// weekDays(today) and stop there, so a driver on Monday morning — the
// worst possible moment, with the week they had just finished one tap
// out of reach and nothing in the current one — was shown $0 and no way
// to look back. It walks weeks now, with the same control the roster
// uses, and every figure on it follows the week being shown.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RideRow from "../RideRow";
import WeekBar from "../WeekBar";
import { loadCompleted, type AssignedJob, type DriverProfile } from "../lib/driver";
// weekDays is the roster's week too (lib/datetime): one Monday-first
// definition, so the chart here and the schedule there can never
// disagree about which seven days "this week" means.
import {
  ARUBA_OFFSET_MINUTES, arubaDayOf, todayInAruba, formatTime, weekDays, weekStart,
} from "../../lib/datetime";
import { COMMISSION_RATE } from "../../lib/quote";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * The hour a ride closed, as the row's mark. slice(0, 2) used to do this,
 * which turned "4:30 AM" into "4:" and "12:40 PM" into "12" — two
 * different shapes in one column, one of them ending in punctuation.
 */
function hourMark(iso: string | null | undefined): string {
  const t = arubaTime(iso);
  return t ? t.split(":")[0] : "·";
}

/** Aruba's wall-clock time for a stored instant. */
function arubaTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return formatTime(new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16));
}

/** Roughly three months of a busy driver's work — as far back as the
    arrows are worth walking before this wants a date range instead. */
const HISTORY_DEPTH = 260;

export default function Earnings({ driver }: { driver: DriverProfile }) {
  const navigate = useNavigate();
  const [rides, setRides] = useState<AssignedJob[] | null>(null);
  /** an ISO date when one day is open, null for the whole week */
  const [day, setDay] = useState<string | null>(null);
  /** any date inside the week being shown */
  const [cursor, setCursor] = useState(() => todayInAruba());

  useEffect(() => {
    let cancelled = false;
    loadCompleted(driver.id, HISTORY_DEPTH).then(({ jobs }) => { if (!cancelled) setRides(jobs); });
    return () => { cancelled = true; };
  }, [driver.id]);

  const today = todayInAruba();
  const days = useMemo(() => weekDays(cursor), [cursor]);
  const onThisWeek = weekStart(cursor) === weekStart(today);

  /** stepping to another week closes whatever day was open in this one */
  const stepWeek = (to: string) => { setCursor(to); setDay(null); };

  /** every completed ride of this week, filed under its Aruba day */
  const byDay = useMemo(() => {
    const m = new Map<string, AssignedJob[]>();
    for (const r of rides ?? []) {
      const d = arubaDayOf(r.completedAt ?? r.scheduledAt);
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(r); else m.set(d, [r]);
    }
    // newest first within a day, so the list reads like the day did
    for (const list of m.values()) {
      list.sort((a, b) =>
        String(b.completedAt ?? b.scheduledAt ?? "").localeCompare(String(a.completedAt ?? a.scheduledAt ?? "")));
    }
    return m;
  }, [rides]);

  const paidOn = (d: string) => (byDay.get(d) ?? []).reduce((s, r) => s + (r.payoutUsd ?? 0), 0);

  const scope = day ? [day] : days;
  const shown = scope.flatMap((d) => byDay.get(d) ?? []);
  const total = scope.reduce((s, d) => s + paidOn(d), 0);
  const jobs = shown.length;
  const peak = Math.max(...days.map(paidOn), 0);

  const dayIndex = day ? days.indexOf(day) : -1;
  const scopeLabel = day
    ? (day === today ? "Today" : DAY_NAMES[dayIndex] ?? "That day")
    : "Mon–Sun";

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">Earnings</div>

        <WeekBar cursor={cursor} onChange={stepWeek} />

        <div className="drv-etot">
          <div className="ek">{day ? "Earned" : onThisWeek ? "Your earnings" : "Earned that week"}</div>
          <div className="ev">${Math.round(total).toLocaleString("en-US")}</div>
          <div className="ed">
            {scopeLabel} · {jobs} job{jobs === 1 ? "" : "s"} · after {Math.round(COMMISSION_RATE * 100)}% Cabby's
          </div>
        </div>

        {/* Bars are buttons. A driver who can open Tuesday and count the
            three rides that made it never has to ask you what the total
            means — which is most of what the history screen is for. */}
        <div className="drv-chart" role="group" aria-label="Earnings by day">
          {days.map((d, i) => {
            const v = paidOn(d);
            const pct = peak > 0 ? Math.max((v / peak) * 100, v > 0 ? 6 : 2) : 2;
            const open = day === d;
            const cls = open ? "open" : v > 0 && v === peak ? "peak" : v > 0 ? "mid" : "";
            return (
              <button
                key={d}
                type="button"
                className={`drv-bar ${cls}`}
                aria-pressed={open}
                aria-label={`${DAY_NAMES[i]}, $${Math.round(v)}, ${(byDay.get(d) ?? []).length} jobs`}
                onClick={() => setDay(open ? null : d)}
              >
                <div className="bfill" style={{ height: `${pct}%` }} />
                <div className="bl">{DAY_LETTERS[i]}</div>
              </button>
            );
          })}
        </div>

        {day && (
          <button type="button" className="drv-cta ghost drv-allweek" onClick={() => setDay(null)}>
            Back to the whole week
          </button>
        )}

        {/* The rides behind the number above. Same row as History, because
            it is the same fact being shown for a different reason. */}
        {shown.length > 0 && (
          <div className="drv-breakdown">
            {shown.map((r) => (
              <RideRow
                key={r.id}
                job={r}
                mark={hourMark(r.completedAt ?? r.scheduledAt)}
                meta={[arubaTime(r.completedAt ?? r.scheduledAt), r.vehicle].filter(Boolean).join(" · ")}
                onOpen={() => navigate(`/drive/ride/${r.id}`)}
              />
            ))}
          </div>
        )}

        <div className="drv-stats">
          <div className="drv-srow">
            <div className="drv-scell">
              <div className="drv-sk">Jobs</div>
              <div className="drv-sv">{jobs}</div>
            </div>
            <div className="drv-scell">
              <div className="drv-sk">Avg / job</div>
              <div className="drv-sv"><small>$</small>{jobs ? Math.round(total / jobs) : 0}</div>
            </div>
          </div>
          <div className="drv-srow">
            <div className="drv-scell">
              <div className="drv-sk">Rating</div>
              <div className="drv-sv">{driver.rating != null ? driver.rating.toFixed(1) : "—"}<small>★</small></div>
            </div>
            <div className="drv-scell">
              <div className="drv-sk">Trips all time</div>
              <div className="drv-sv">{driver.tripsCount}</div>
            </div>
          </div>
        </div>

        {/* What is actually known. There is no payouts table, no paid flag
            on a ride and no schedule agreed with the client, so this says
            what it can stand behind — the week's earned total — and does
            not name a day. The version that did was inventing both the
            date and the amount, and a driver who is told the wrong payday
            once does not believe the next figure either. */}
        {/* The figure appears only when the headline above is showing a
            single day — otherwise this block was printing the same total
            twice on one screen, 400px apart. What it is really for is the
            sentence under it. */}
        <div className="drv-payout">
          {/* the label follows the figure: with one, it names it; without
              one, it names what the paragraph underneath is about */}
          <div className="pk">
            {day ? (onThisWeek ? "Earned this week" : "Earned that week") : "Your payout"}
          </div>
          {day && (
            <div className="pv">${Math.round(days.reduce((s, d) => s + paidOn(d), 0)).toLocaleString("en-US")}</div>
          )}
          <div className="pd">
            Cabby's confirms your payout schedule directly. This is your completed work
            Monday to Sunday, after the {Math.round(COMMISSION_RATE * 100)}% commission.
          </div>
        </div>

        {/* Two different silences, and saying "nothing earned yet" for
            both is how a driver browsing back through a quiet February
            gets told they have never earned anything. */}
        {rides !== null && rides.length === 0 ? (
          <div className="drv-empty">
            <div className="es">Nothing earned yet.</div>
            <p className="et">Completed trips show up here the moment you close them.</p>
          </div>
        ) : rides !== null && jobs === 0 ? (
          <div className="drv-empty">
            <div className="es">Nothing in that week.</div>
            <p className="et">No completed trips between Monday and Sunday. Step back or forward to find one.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
