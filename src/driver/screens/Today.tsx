// The agenda — a shift, not a feed.
//
// Transfers are pre-booked days ahead, so a driver's work is a diary, not
// a queue. Today is what they act on; Tomorrow is what they plan around;
// Later is everything already promised. Three segments, because a driver
// deciding whether to take a Friday job needs to see Friday.
//
// "Nothing assigned" is only ever said when the query actually came back
// empty. A failed read says so, with the database's own words — reporting
// both the same way is how this screen sat blank while work was sitting
// in it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import JobCard, { jobDateShort, minutesUntil, statusChip } from "../JobCard";
import {
  loadAssigned, loadCompleted, minutesUntilPickup,
  type AssignedJob, type DriverProfile,
} from "../lib/driver";
import { todayInAruba, addDays, ARUBA_OFFSET_MINUTES } from "../../lib/datetime";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Span = "today" | "tomorrow" | "later";

function greeting(hourAruba: number): string {
  if (hourAruba < 12) return "Good morning,";
  if (hourAruba < 18) return "Good afternoon,";
  return "Good evening,";
}

function arubaNow(now = Date.now()) {
  const d = new Date(now + ARUBA_OFFSET_MINUTES * 60_000);
  return { hour: d.getUTCHours(), weekday: WEEKDAYS[d.getUTCDay()] };
}

/** Aruba's calendar day for a stored instant. */
function arubaDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export default function Today({ driver }: { driver: DriverProfile }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [jobs, setJobs] = useState<AssignedJob[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // loadAssigned excludes completed rides, and that's where the money is —
  // today's total has to come from the completed query or it reads $0 all day
  const [done, setDone] = useState<AssignedJob[]>([]);

  const refresh = useCallback(async () => {
    const [assigned, completed] = await Promise.all([
      loadAssigned(driver.id),
      loadCompleted(driver.id, 40),
    ]);
    setFailed(assigned.error);
    setJobs(assigned.jobs);
    setDone(completed.jobs);
  }, [driver.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const today = todayInAruba();
  const tomorrow = addDays(today, 1);
  const { hour, weekday } = arubaNow();
  const all = useMemo(() => jobs ?? [], [jobs]);

  const buckets = useMemo(() => {
    const b: Record<Span, AssignedJob[]> = { today: [], tomorrow: [], later: [] };
    for (const j of all) {
      const d = arubaDay(j.scheduledAt);
      if (d === today || d === "") b.today.push(j);
      else if (d === tomorrow) b.tomorrow.push(j);
      else b.later.push(j);
    }
    return b;
  }, [all, today, tomorrow]);

  // the segment worth opening on: wherever the next actual work is
  const preferred: Span =
    buckets.today.length ? "today" : buckets.tomorrow.length ? "tomorrow" : buckets.later.length ? "later" : "today";
  const raw = params.get("span");
  const span: Span = raw === "today" || raw === "tomorrow" || raw === "later" ? raw : preferred;
  const setSpan = (s: Span) => setParams(s === preferred ? {} : { span: s }, { replace: true });

  const doneToday = done.filter((j) => arubaDay(j.completedAt ?? j.scheduledAt) === today);
  const earned = doneToday.reduce((sum, j) => sum + (j.fare ?? 0), 0);
  const list = buckets[span];
  const firstName = (driver.fullName || "Driver").split(" ")[0];

  function chipFor(job: AssignedJob, isFirstToday: boolean) {
    if (job.status !== "driver_assigned") return statusChip(job.status);
    const mins = minutesUntil(job.scheduledAt);
    if (mins != null && mins < 0) return { tone: "alert" as const, label: "Overdue" };
    if (isFirstToday && mins != null && mins <= 90) {
      return { tone: "next" as const, label: mins < 60 ? `Next · in ${mins} min` : "Next" };
    }
    return { tone: "" as const, label: "Booked" };
  }

  const TABS: { key: Span; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "later", label: "Later" },
  ];

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">
          {weekday} · {buckets.today.length + doneToday.length} job
          {buckets.today.length + doneToday.length === 1 ? "" : "s"}
        </div>
        <h1 className="big">{greeting(hour)}<br /><em>{firstName}.</em></h1>

        <div className="drv-stats">
          <div className="drv-srow">
            <div className="drv-scell">
              <div className="drv-sk">Earned today</div>
              <div className="drv-sv"><small>$</small>{Math.round(earned)}</div>
            </div>
            <div className="drv-scell">
              <div className="drv-sk">Jobs left</div>
              <div className="drv-sv">{buckets.today.length}</div>
            </div>
          </div>
        </div>

        <div className="drv-seg drv-span" role="group" aria-label="Which day">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={span === t.key ? "on" : ""}
              aria-pressed={span === t.key}
              onClick={() => setSpan(t.key)}
            >
              {t.label}
              {buckets[t.key].length > 0 && <b>{buckets[t.key].length}</b>}
            </button>
          ))}
        </div>

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
        ) : list.length === 0 ? (
          <div className="drv-empty">
            <div className="es">
              {span === "today" ? "Nothing more today." : span === "tomorrow" ? "Tomorrow's clear." : "Nothing further out."}
            </div>
            <p className="et">
              {driver.isOnline
                ? "You're online. New rides come to you, or claim one from the pool."
                : "Go online to start receiving job requests."}
            </p>
          </div>
        ) : (
          list.map((j, i) => (
            <JobCard
              key={j.id}
              job={j}
              chip={chipFor(j, span === "today" && i === 0)}
              showDay={span === "later"}
              onOpen={() => navigate(`/drive/ride/${j.id}`)}
            />
          ))
        )}

        {/* what's next, when it isn't in the segment being looked at */}
        {!failed && span !== "later" && list.length === 0 && all.length > 0 && (
          <p className="sub" style={{ marginTop: 4, fontSize: "12px" }}>
            Next job {jobDateShort(all[0].scheduledAt)}
            {minutesUntilPickup(all[0]) != null && Number(minutesUntilPickup(all[0])) > 0
              ? ` · in ${Math.round(Number(minutesUntilPickup(all[0])) / 60)}h`
              : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
