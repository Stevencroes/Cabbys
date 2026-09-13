// The roster — a week at a time, Monday to Sunday.
//
// Transfers are pre-booked days ahead, so a driver's work is a diary, not
// a feed. What this screen replaced was three soft buckets — Today,
// Tomorrow, Later — and "Later" is not a day of the week: a driver asked
// to take Saturday's airport run had no way to see what Saturday already
// looked like, and no way to see next week at all.
//
// So the unit here is the WEEK, the one a shift pattern actually has.
// Seven columns, Monday first, each carrying its own count and its own
// money; ‹ and › walk to any week, backwards into what was driven and
// forwards into what is promised. Two readings of the same seven days:
//   · Week — the whole roster, every day listed, free days included,
//     because an empty Thursday is information.
//   · Day  — one day down its own clock, with the gaps between pickups
//     shown, which is what a driver plans a lunch or a school run around.
//
// Completed work stays on the roster rather than disappearing from it. A
// day you have already driven is still part of the week you are reading.
//
// "Nothing assigned" is only ever said when the query actually came back
// empty. A failed read says so, with the database's own words — reporting
// both the same way is how this screen sat blank while work was sitting
// in it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import JobCard, { jobTime, minutesUntil, shortAirport, statusChip, type ChipTone } from "../JobCard";
import PeriodBar from "../PeriodBar";
import {
  loadAssigned, loadCancelled, loadCompleted, minutesUntilPickup,
  type AssignedJob, type DriverProfile,
} from "../lib/driver";
import {
  todayInAruba, addDays, arubaDayOf, dayOfMonth, monthShort, weekDays,
  weekStart, weekdayLong, weekdayShort, ARUBA_OFFSET_MINUTES,
} from "../../lib/datetime";

type View = "week" | "day";

function greeting(hourAruba: number): string {
  if (hourAruba < 12) return "Good morning,";
  if (hourAruba < 18) return "Good afternoon,";
  return "Good evening,";
}

function arubaHourNow(now = Date.now()): number {
  return new Date(now + ARUBA_OFFSET_MINUTES * 60_000).getUTCHours();
}

/** "Today", "Tomorrow", "Yesterday", else "Saturday". */
function dayName(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  return weekdayLong(iso);
}

/**
 * The date under the day's name, saying whatever the name didn't. Beside
 * "Today" the weekday is the missing half, so it leads; beside "Thursday"
 * it is the half already said, so the month takes its place. Printing
 * "Thursday · THU 10" is a row using two lines to say one thing.
 */
function daySub(iso: string, today: string): string {
  const named = dayName(iso, today) === weekdayLong(iso);
  return named
    ? `${dayOfMonth(iso)} ${monthShort(iso)}`
    : `${weekdayShort(iso)} ${dayOfMonth(iso)} ${monthShort(iso)}`;
}

/** "3h 10m", "45m" — the distance between two pickups. */
function gapLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** A gap worth naming. Below this it is just the next job. */
const GAP_MINUTES = 45;

interface RosterProps {
  list: AssignedJob[];
  /** true once the day is behind us — an empty past day reads differently */
  past: boolean;
  chipFor: (job: AssignedJob) => { tone: ChipTone; label: string };
  onOpen: (id: string) => void;
}

/**
 * One day's jobs, down its own clock, with the gaps between them.
 *
 * Declared out here rather than inside Schedule. A component defined in a
 * render body is a NEW type on every render, so React throws the whole
 * subtree away and rebuilds it each time the week cursor moves — every
 * card remounted and every entrance animation replayed for a state change
 * that touched none of them.
 */
function DayRoster({ list, past, chipFor, onOpen }: RosterProps) {
  if (list.length === 0) {
    return (
      <div className="drv-free">
        <span className="fk">No jobs</span>
        <span className="fv">{past ? "Nothing was driven." : "The day is clear."}</span>
      </div>
    );
  }
  return (
    <>
      {list.map((job, i) => {
        const prev = i > 0 ? list[i - 1] : null;
        const gap =
          prev?.scheduledAt && job.scheduledAt
            ? Math.round(
                (new Date(job.scheduledAt).getTime() - new Date(prev.scheduledAt).getTime()) / 60_000,
              )
            : 0;
        return (
          <div key={job.id}>
            {gap >= GAP_MINUTES && (
              <div className="drv-gap" aria-hidden="true">
                <span>{gapLabel(gap)} between pickups</span>
              </div>
            )}
            <div className="drv-slot">
              <div className="drv-clock">
                <span className="ct">{jobTime(job.scheduledAt)}</span>
              </div>
              <div className="drv-slotbody">
                {/* the clock stands in the rail, so the card drops its own */}
                <JobCard job={job} chip={chipFor(job)} headline={null} onOpen={() => onOpen(job.id)} />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function Schedule({ driver }: { driver: DriverProfile }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [jobs, setJobs] = useState<AssignedJob[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // loadAssigned excludes completed rides, and that's where the money is —
  // a week's total has to come from the completed query or it reads $0
  const [done, setDone] = useState<AssignedJob[]>([]);
  // work that was taken away — on the roster, not silently absent from it
  const [gone, setGone] = useState<AssignedJob[]>([]);

  const refresh = useCallback(async () => {
    const [assigned, completed, cancelled] = await Promise.all([
      loadAssigned(driver.id),
      // 120 covers roughly two months of a busy driver's completed work,
      // which is as far back as the ‹ arrow is worth walking
      loadCompleted(driver.id, 120),
      loadCancelled(driver.id),
    ]);
    setFailed(assigned.error);
    setJobs(assigned.jobs);
    setDone(completed.jobs);
    setGone(cancelled.jobs);
  }, [driver.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const today = todayInAruba();

  // One piece of state carries both questions the screen answers: WHICH
  // day is selected, and — through its Monday — which week is on show.
  // Two params would let them disagree, and a strip highlighting a day
  // that isn't in the week beneath it is worse than no highlight at all.
  const rawDay = params.get("day") ?? "";
  const cursor = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : today;
  const view: View = params.get("view") === "day" ? "day" : "week";
  const days = useMemo(() => weekDays(cursor), [cursor]);

  const go = (day: string, next: View = view) =>
    setParams(
      day === today && next === "week" ? {} : { day, ...(next === "day" ? { view: "day" } : {}) },
      { replace: true },
    );

  /**
   * Every job of the week, filed under the day it is DRIVEN on.
   *
   * Placed by scheduled_at, not completed_at: this is a roster, and a job
   * belongs to its appointment. The money below is bucketed the other way
   * round — by completed_at, the way Earnings does it — because a job
   * booked Friday and driven Saturday is Saturday's pay. Same rides, two
   * axes, and each is right for the question being asked of it.
   */
  const byDay = useMemo(() => {
    const m = new Map<string, AssignedJob[]>();
    for (const j of [...(jobs ?? []), ...done, ...gone]) {
      const d = arubaDayOf(j.scheduledAt) || arubaDayOf(j.completedAt);
      if (!d) continue;
      const list = m.get(d);
      if (list) list.push(j); else m.set(d, [j]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => String(a.scheduledAt ?? "").localeCompare(String(b.scheduledAt ?? "")));
    }
    return m;
  }, [jobs, done, gone]);

  /** what was actually earned on a day — completed work only */
  const paidOn = useCallback(
    (d: string) =>
      done
        .filter((j) => arubaDayOf(j.completedAt ?? j.scheduledAt) === d)
        .reduce((s, j) => s + (j.payoutUsd ?? 0), 0),
    [done],
  );

  const jobsOn = (d: string) => byDay.get(d) ?? [];
  /** what a day still ASKS of a driver — a cancelled ride is on the
      roster to be seen, not to be counted as work */
  const liveOn = (d: string) => jobsOn(d).filter((j) => j.status !== "cancelled");
  const weekJobs = days.reduce((n, d) => n + liveOn(d).length, 0);
  const weekPaid = days.reduce((s, d) => s + paidOn(d), 0);
  const leftToday = jobsOn(today).filter((j) => j.status !== "completed" && j.status !== "cancelled").length;

  // The next job anywhere ahead, not just inside the week being browsed —
  // a driver reading next Tuesday still wants to know what's coming today.
  const upcoming = useMemo(
    () => (jobs ?? [])
      .filter((j) => (minutesUntil(j.scheduledAt) ?? 0) >= 0)
      .sort((a, b) => String(a.scheduledAt ?? "").localeCompare(String(b.scheduledAt ?? ""))),
    [jobs],
  );
  const next = upcoming[0] ?? null;

  /**
   * Cancellations a driver has not driven past yet.
   *
   * The ones behind them are history and sit quietly on the roster. The
   * ones ahead are the whole point: a 6am airport run called off last
   * night is the single most expensive thing this screen can fail to
   * mention.
   */
  const calledOff = useMemo(
    () => gone
      .filter((j) => (minutesUntilPickup(j) ?? -1) > 0)
      .sort((a, b) => String(a.scheduledAt ?? "").localeCompare(String(b.scheduledAt ?? ""))),
    [gone],
  );

  const firstName = (driver.fullName || "Driver").split(" ")[0];
  const thisWeek = weekStart(today);
  const onThisWeek = days[0] === thisWeek;

  const openRide = (id: string) => navigate(`/drive/ride/${id}`);

  function chipFor(job: AssignedJob): { tone: ChipTone; label: string } {
    // statusChip already knows "cancelled" is an alert — the roster's own
    // Next/Overdue reasoning only ever applied to work still standing.
    if (job.status !== "driver_assigned") return statusChip(job.status);
    const mins = minutesUntil(job.scheduledAt);
    if (mins != null && mins < 0) return { tone: "alert", label: "Overdue" };
    if (next && job.id === next.id && mins != null && mins <= 90) {
      return { tone: "next", label: mins < 60 ? `Next · in ${mins} min` : "Next" };
    }
    return { tone: "", label: "Booked" };
  }

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">{weekdayLong(today)} {dayOfMonth(today)} · Aruba</div>
        <h1 className="big">{greeting(arubaHourNow())}<br /><em>{firstName}.</em></h1>

        {calledOff.length > 0 && (
          <div className="drv-called" role="alert">
            <div className="ck">{calledOff.length === 1 ? "A ride was cancelled" : `${calledOff.length} rides were cancelled`}</div>
            <ul>
              {calledOff.slice(0, 3).map((j) => (
                <li key={j.id}>
                  {dayName(arubaDayOf(j.scheduledAt), today)} {jobTime(j.scheduledAt)} · {shortAirport(j.pickup)} → {shortAirport(j.dropoff)}
                </li>
              ))}
            </ul>
            <p>Don't drive to {calledOff.length === 1 ? "it" : "them"}. They stay on the roster below, marked cancelled.</p>
          </div>
        )}

        <div className="drv-stats">
          <div className="drv-srow">
            <div className="drv-scell">
              <div className="drv-sk">{onThisWeek ? "Earned this week" : "Earned that week"}</div>
              <div className="drv-sv"><small>$</small>{Math.round(weekPaid)}</div>
            </div>
            <div className="drv-scell">
              <div className="drv-sk">Jobs in week</div>
              <div className="drv-sv">{weekJobs}</div>
            </div>
          </div>
          <div className="drv-srow">
            <div className="drv-scell">
              <div className="drv-sk">Left today</div>
              <div className="drv-sv">{leftToday}</div>
            </div>
            <div className="drv-scell">
              <div className="drv-sk">Next job</div>
              <div className="drv-sv sm">
                {next
                  ? `${arubaDayOf(next.scheduledAt) === today ? "Today" : weekdayShort(arubaDayOf(next.scheduledAt))} ${jobTime(next.scheduledAt)}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* ── the week: walk it, then pick a day out of it ── */}
        <PeriodBar cursor={cursor} onChange={(d) => go(d)} />

        <div className="drv-week" role="group" aria-label="Days of the week">
          {days.map((d) => {
            const n = liveOn(d).length;
            const selected = view === "day" && d === cursor;
            const cls = [
              "wday",
              selected ? "on" : "",
              d === today ? "now" : "",
              n === 0 ? "idle" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={d}
                type="button"
                className={cls}
                aria-pressed={selected}
                aria-label={`${weekdayLong(d)} ${dayOfMonth(d)} — ${n} job${n === 1 ? "" : "s"}`}
                onClick={() => go(d, selected ? "week" : "day")}
              >
                <span className="wl">{weekdayShort(d).slice(0, 2)}</span>
                <span className="wn">{dayOfMonth(d)}</span>
                <span className="wc">{n > 0 ? n : ""}</span>
              </button>
            );
          })}
        </div>

        {!onThisWeek && (
          <button type="button" className="drv-cta ghost drv-allweek" onClick={() => go(today, view)}>
            Back to this week
          </button>
        )}

        {jobs === null ? (
          <div className="drv-empty"><p className="et">Loading your schedule.</p></div>
        ) : failed ? (
          // Not "nothing assigned" — the schedule could not be read at all.
          <div className="drv-empty" role="alert">
            <div className="es">Can't read your schedule.</div>
            <p className="et">
              Your jobs may still be assigned — this portal just can't load them. Run the
              latest docs/driver-schema.sql, then try again.
            </p>
            <p className="et mono" style={{ marginTop: 10, opacity: 0.7 }}>{failed}</p>
            <button type="button" className="drv-cta ghost" style={{ marginTop: 14 }} onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : view === "day" ? (
          <>
            <div className="drv-dayhead">
              <div>
                <div className="dn">{dayName(cursor, today)}</div>
                <div className="dd">{daySub(cursor, today)}</div>
              </div>
              <div className="dp">
                <span className="dk">{liveOn(cursor).length} job{liveOn(cursor).length === 1 ? "" : "s"}</span>
                {paidOn(cursor) > 0 && <span className="dv">${Math.round(paidOn(cursor))}</span>}
              </div>
            </div>
            <DayRoster
              list={jobsOn(cursor)}
              past={cursor < today}
              chipFor={chipFor}
              onOpen={openRide}
            />
            <button type="button" className="drv-cta ghost drv-allweek" onClick={() => go(cursor, "week")}>
              See the whole week
            </button>
          </>
        ) : weekJobs === 0 ? (
          <div className="drv-empty">
            <div className="es">{onThisWeek ? "Nothing booked this week." : "That week is clear."}</div>
            <p className="et">
              {driver.isOnline
                ? "You're online. New rides come to you, or claim one from the pool."
                : "Go online to start receiving job requests."}
            </p>
          </div>
        ) : (
          <>
            {days.map((d) => {
              const list = jobsOn(d);
              return (
                <section key={d} className={`drv-daysec${d === today ? " now" : ""}${list.length === 0 ? " idle" : ""}`}>
                  <button type="button" className="drv-dayrow" onClick={() => go(d, "day")}>
                    <span className="dl">
                      <span className="dw">{dayName(d, today)}</span>
                      <span className="dm">{daySub(d, today)}</span>
                    </span>
                    <span className="dr">
                      {paidOn(d) > 0 && <span className="dpay">${Math.round(paidOn(d))}</span>}
                      <span className="dcount">{list.length || "Free"}</span>
                    </span>
                  </button>
                  {list.length > 0 && (
                    <DayRoster list={list} past={d < today} chipFor={chipFor} onOpen={openRide} />
                  )}
                </section>
              );
            })}
            <p className="sub" style={{ marginTop: 18, fontSize: "11.5px" }}>
              Tap any day to open it on its own clock.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
