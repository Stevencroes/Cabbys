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
//
// Three scopes, because a driver asks three different questions of this
// screen: what did today make, what is this week worth, and what did the
// month come to. The week is still the default and still the shape of
// the chart — the month draws the same bars, one per day, because "which
// days did I work" is the question a month total raises and a bar per
// WEEK would answer a question nobody asked.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RideRow from "../RideRow";
import PeriodBar, { type Period } from "../PeriodBar";
import { loadCompleted, type AssignedJob, type DriverProfile } from "../lib/driver";
// weekDays is the roster's week too (lib/datetime): one Monday-first
// definition, so the chart here and the schedule there can never
// disagree about which seven days "this week" means.
import {
  ARUBA_OFFSET_MINUTES, arubaDayOf, todayInAruba, formatTime, weekDays, monthDays,
  formatDateShort, dayOfMonth, weekdayLong,
} from "../../lib/datetime";
import { awgToUsd, COMMISSION_RATE } from "../../lib/quote";

const SCOPES: { key: Period; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

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

/** How many rides the breakdown lists before pointing at History. */
const BREAKDOWN = 12;

export default function Earnings({ driver }: { driver: DriverProfile }) {
  const navigate = useNavigate();
  const [rides, setRides] = useState<AssignedJob[] | null>(null);
  /**
   * The read failed — not "nothing earned". This screen used to take
   * `{ jobs }` and drop the error on the floor, so a driver on one bar of
   * signal was told "Nothing earned yet" over a week of completed work:
   * the one screen whose whole job is to be believed, stating a falsehood
   * about money. The house rule everywhere else in the portal is that a
   * failed query is never reported as an empty result.
   */
  const [failed, setFailed] = useState<string | null>(null);
  /** bumped by "Try again", which is all a re-read needs */
  const [attempt, setAttempt] = useState(0);
  /** an ISO date when one day is open, null for the whole period */
  const [day, setDay] = useState<string | null>(null);
  /** any date inside the period being shown */
  const [cursor, setCursor] = useState(() => todayInAruba());
  /** which question is being asked: today, this week, or this month */
  const [scope, setScope] = useState<Period>("week");

  useEffect(() => {
    let cancelled = false;
    setRides(null);
    setFailed(null);
    loadCompleted(driver.id, HISTORY_DEPTH).then(({ jobs, error }) => {
      if (cancelled) return;
      setFailed(error);
      setRides(jobs);
    });
    return () => { cancelled = true; };
  }, [driver.id, attempt]);

  const today = todayInAruba();
  const days = useMemo(
    () => (scope === "day" ? [cursor] : scope === "month" ? monthDays(cursor) : weekDays(cursor)),
    [cursor, scope],
  );
  /** is the period on show the one we are living in? */
  const current = scope === "day" ? cursor === today
    : scope === "month" ? cursor.slice(0, 7) === today.slice(0, 7)
    : days.includes(today);

  /** stepping to another period closes whatever day was open in the last */
  const step = (to: string) => { setCursor(to); setDay(null); };

  /** switching scope always lands on the period containing today */
  const goScope = (next: Period) => { setScope(next); setCursor(today); setDay(null); };

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

  /** the days actually being totalled — one, when a bar is open */
  const span = day ? [day] : days;
  const shown = span.flatMap((d) => byDay.get(d) ?? []);
  const total = span.reduce((s, d) => s + paidOn(d), 0);
  const jobs = shown.length;
  const peak = Math.max(...days.map(paidOn), 0);

  /**
   * The arithmetic behind the figure, which a driver reconciling a payout
   * is doing in their head anyway. The fares are what the guests paid;
   * the difference is the commission, derived rather than re-calculated,
   * so the three lines cannot disagree with each other or with the total.
   */
  const fares = shown.reduce((s, r) => s + (r.fareAwg != null ? awgToUsd(r.fareAwg) : 0), 0);
  const fee = fares - total;

  const periodLabel =
    scope === "day" ? "One day"
    : scope === "month" ? "Whole month"
    : "Mon–Sun";
  const spanLabel = day ? (day === today ? "Today" : weekdayLong(day) || "That day") : periodLabel;

  const loading = rides === null;
  /** money, as the screen prints it — or a dash while nothing is known,
      because "$0" during a load is a claim, and the wrong one */
  const money = (v: number) => (loading ? "—" : `$${Math.round(v).toLocaleString("en-US")}`);

  return (
    <div className="drv-view">
      <div className="drv-pad">
        {/* The screen's heading, set as the quiet line above everything —
            it was a <div>, which left Earnings the one screen in the
            portal with no heading for a screen reader to land on. */}
        <h1 className="kick">Earnings</h1>

        {/* The three questions a driver asks this screen, in the order
            they ask them. Switching always lands on the period containing
            today — stepping back is what the arrows are for. */}
        <div className="drv-seg drv-span" role="group" aria-label="Which period">
          {SCOPES.map((sc) => (
            <button
              key={sc.key}
              type="button"
              className={scope === sc.key ? "on" : ""}
              aria-pressed={scope === sc.key}
              onClick={() => goScope(sc.key)}
            >{sc.label}</button>
          ))}
        </div>

        <PeriodBar cursor={cursor} period={scope} onChange={step} />

        {failed ? (
          // Not "nothing earned" — the trips could not be read at all.
          <div className="drv-empty" role="alert">
            <div className="es">Can't read your earnings.</div>
            <p className="et">
              Your completed trips are still on record — this portal just can't load them.
              Check your signal, then try again.
            </p>
            <p className="et mono">{failed}</p>
            <button type="button" className="drv-cta ghost" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* The figure and its chart, and beside them on a desk the
                rides that make it up (THE COLUMNS). On a phone the list
                follows the chart, as it always did. */}
            <div className="drv-cols wide-main">
              <div className="drv-main">
                <div className="drv-etot" aria-busy={loading}>
                  <div className="ek">
                    {day ? "Earned" : current ? "Your earnings" : scope === "month" ? "Earned that month" : "Earned then"}
                  </div>
                  <div className="ev">{money(total)}</div>
                  <div className="ed">
                    {loading
                      ? "Loading your completed trips."
                      : `${spanLabel} · ${jobs} job${jobs === 1 ? "" : "s"} · after ${Math.round(COMMISSION_RATE * 100)}% Cabby's`}
                  </div>
                </div>

                {/* What the figure is made of. A driver reconciling a payout does
                    this arithmetic in their head; doing it for them is the whole
                    reason they believe the number at the top. */}
                {jobs > 0 && (
                  <dl className="drv-made">
                    <div><dt>Guest fares</dt><dd>${Math.round(fares).toLocaleString("en-US")}</dd></div>
                    <div><dt>Cabby's {Math.round(COMMISSION_RATE * 100)}%</dt><dd className="off">−${Math.round(fee).toLocaleString("en-US")}</dd></div>
                    <div className="sum"><dt>You earned</dt><dd>${Math.round(total).toLocaleString("en-US")}</dd></div>
                  </dl>
                )}

                {/* Bars are buttons. A driver who can open Tuesday and count the
                    three rides that made it never has to ask you what the total
                    means — which is most of what the history screen is for.
                    A single day has nothing to chart, so it draws none; nor does
                    a period still loading, because a row of empty bars is a
                    week of zeros, stated. */}
                {scope !== "day" && !loading && (
                  <div
                    className={`drv-chart${scope === "month" ? " dense" : ""}${day ? " has-sel" : ""}`}
                    role="group"
                    aria-label="Earnings by day"
                  >
                    {days.map((d) => {
                      const v = paidOn(d);
                      const pct = peak > 0 ? Math.max((v / peak) * 100, v > 0 ? 6 : 0) : 0;
                      const open = day === d;
                      // A week labels every bar; a month has thirty-one of them
                      // and labels the ones a thumb can aim at, which is every
                      // seventh. The aria-label always says all of it.
                      const tick = scope === "week"
                        ? weekdayLong(d).charAt(0)
                        : dayOfMonth(d) === 1 || dayOfMonth(d) % 7 === 0 ? String(dayOfMonth(d)) : "";
                      // One number written on the chart, not seven: the open
                      // day's, or failing that the best one. Every other bar
                      // says its own on hover and focus, and in its label.
                      const said = open || (!day && v > 0 && v === peak);
                      return (
                        <button
                          key={d}
                          type="button"
                          className={`drv-bar${open ? " open" : ""}${v > 0 ? "" : " zero"}`}
                          aria-pressed={open}
                          aria-label={`${scope === "week" ? weekdayLong(d) : formatDateShort(d)}, $${Math.round(v)}, ${(byDay.get(d) ?? []).length} jobs`}
                          data-v={`$${Math.round(v)}`}
                          onClick={() => setDay(open ? null : d)}
                        >
                          <span className="bplot">
                            {said && <span className="bv" aria-hidden="true">${Math.round(v)}</span>}
                            <span className="bfill" style={{ height: `${pct}%` }} />
                          </span>
                          <span className="bl" aria-hidden="true">{tick}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {day && (
                  <button type="button" className="drv-cta ghost drv-allweek" onClick={() => setDay(null)}>
                    Back to the whole {scope === "month" ? "month" : "week"}
                  </button>
                )}
              </div>

              <aside className="drv-aside scrolls" aria-label="The trips behind the figure">
                {/* The rides behind the figure above. Same row as History,
                    because it is the same fact being shown for a different
                    reason — and capped, because a busy month is forty of
                    them and this screen's job is to make a total
                    checkable, not to be a second history, which exists,
                    has search and month bands, and is one tab away. */}
                {shown.length > 0 && (
                  <div className="drv-breakdown">
                    {shown.slice(0, BREAKDOWN).map((r) => (
                      <RideRow
                        key={r.id}
                        job={r}
                        mark={hourMark(r.completedAt ?? r.scheduledAt)}
                        meta={[
                          // The date earns its place the moment the span is wider
                          // than a day: forty rides reading "12:00 PM · The Scout"
                          // tell a driver nothing about which of them is which.
                          span.length > 1 ? formatDateShort(arubaDayOf(r.completedAt ?? r.scheduledAt)) : null,
                          arubaTime(r.completedAt ?? r.scheduledAt),
                          r.vehicle,
                        ].filter(Boolean).join(" · ")}
                        onOpen={() => navigate(`/drive/ride/${r.id}`)}
                      />
                    ))}
                    {shown.length > BREAKDOWN && (
                      <p className="sub foot" style={{ marginTop: 14 }}>
                        {shown.length - BREAKDOWN} more in this {scope === "month" ? "month" : "week"} — all of them,
                        searchable, under History.
                      </p>
                    )}
                  </div>
                )}

                {/* Two different silences, and saying "nothing earned yet" for
                    both is how a driver browsing back through a quiet February
                    gets told they have never earned anything. They sit where
                    the rides would have been, rather than under the payout
                    note at the foot of the screen where they used to land. */}
                {rides !== null && rides.length === 0 ? (
                  <div className="drv-empty">
                    <div className="es">Nothing earned yet.</div>
                    <p className="et">Completed trips show up here the moment you close them.</p>
                  </div>
                ) : rides !== null && jobs === 0 ? (
                  <div className="drv-empty">
                    <div className="es">Nothing in that {scope === "month" ? "month" : scope === "day" ? "day" : "week"}.</div>
                    <p className="et">
                      No completed trips {scope === "month" ? "in that month" : scope === "day" ? "that day" : "between Monday and Sunday"}.
                      Step back or forward to find one.
                    </p>
                  </div>
                ) : null}
              </aside>
            </div>

            <div className="drv-stats">
              <div className="drv-srow">
                <div className="drv-scell">
                  <div className="drv-sk">Jobs</div>
                  <div className="drv-sv">{loading ? "—" : jobs}</div>
                </div>
                <div className="drv-scell">
                  <div className="drv-sk">Avg / job</div>
                  <div className="drv-sv">{loading ? "—" : <><small>$</small>{jobs ? Math.round(total / jobs) : 0}</>}</div>
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
                {day
                  ? `${current ? "Earned this" : "Earned that"} ${scope === "month" ? "month" : "week"}`
                  : "Your payout"}
              </div>
              {day && (
                <div className="pv">${Math.round(days.reduce((s, d) => s + paidOn(d), 0)).toLocaleString("en-US")}</div>
              )}
              <div className="pd">
                Cabby's confirms your payout schedule directly. This is your completed work
                {scope === "month" ? " over the month" : scope === "day" ? " that day" : " Monday to Sunday"},
                after the {Math.round(COMMISSION_RATE * 100)}% commission.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
