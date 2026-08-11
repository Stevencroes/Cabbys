// Today — a shift, not a feed.
//
// Transfers are pre-booked, so a driver's day is a known list, not a live
// auction. This is that list with the next job first, because 95% of the
// time it is the only thing they need to see.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import JobCard, { minutesUntil, statusChip } from "../JobCard";
import { loadAssigned, loadCompleted, type AssignedJob, type DriverProfile } from "../lib/driver";
import { todayInAruba, ARUBA_OFFSET_MINUTES } from "../../lib/datetime";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
function arubaDay(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export default function Today({ driver }: { driver: DriverProfile }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<AssignedJob[] | null>(null);
  // loadAssigned deliberately excludes completed rides, so today's money
  // has to come from the completed query — otherwise "Today" reads $0 all
  // day no matter how much has been driven.
  const [done, setDone] = useState<AssignedJob[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadAssigned(driver.id).then((rows) => { if (!cancelled) setJobs(rows); });
    loadCompleted(driver.id, 40).then((rows) => { if (!cancelled) setDone(rows); });
    return () => { cancelled = true; };
  }, [driver.id]);

  const { hour, weekday } = arubaNow();
  const today = todayInAruba();
  const all = jobs ?? [];
  const todays = all.filter((j) => arubaDay(j.scheduledAt) === today);
  // Earned counts work actually finished, dated by when it finished — a
  // fare isn't yours until the trip is.
  const doneToday = done.filter((j) => arubaDay(j.completedAt ?? j.scheduledAt) === today);
  const earned = doneToday.reduce((sum, j) => sum + (j.fare ?? 0), 0);
  const left = todays.filter((j) => j.status !== "cancelled").length;

  const firstName = (driver.fullName || "Driver").split(" ")[0];
  const next = all[0] ?? null;
  const rest = all.slice(1);

  function chipFor(job: AssignedJob, isNext: boolean) {
    if (job.status !== "driver_assigned") return statusChip(job.status);
    const mins = minutesUntil(job.scheduledAt);
    if (isNext && mins != null && mins >= 0 && mins <= 90) {
      return { tone: "next" as const, label: mins < 60 ? `Next · in ${mins} min` : "Next" };
    }
    if (mins != null && mins < 0) return { tone: "alert" as const, label: "Overdue" };
    return { tone: "" as const, label: arubaDay(job.scheduledAt) === today ? "Later today" : "Upcoming" };
  }

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">
          {weekday} · {todays.length + doneToday.length} job{todays.length + doneToday.length === 1 ? "" : "s"}
        </div>
        <h1 className="big">{greeting(hour)}<br /><em>{firstName}.</em></h1>

        <div className="drv-stats">
          <div className="drv-srow">
            <div className="drv-scell">
              <div className="drv-sk">Today</div>
              <div className="drv-sv"><small>$</small>{Math.round(earned)}</div>
            </div>
            <div className="drv-scell">
              <div className="drv-sk">Jobs left</div>
              <div className="drv-sv">{left}</div>
            </div>
          </div>
        </div>

        <div className="kick" style={{ margin: "22px 0 12px" }}>Next up</div>

        {jobs === null ? (
          <div className="drv-empty"><p className="et">Loading your day.</p></div>
        ) : next ? (
          <>
            <JobCard job={next} chip={chipFor(next, true)} onOpen={() => navigate(`/drive/ride/${next.id}`)} />
            {rest.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                chip={chipFor(j, false)}
                showDay={arubaDay(j.scheduledAt) !== today}
                onOpen={() => navigate(`/drive/ride/${j.id}`)}
              />
            ))}
          </>
        ) : (
          <div className="drv-empty">
            <div className="es">Nothing assigned.</div>
            <p className="et">
              {driver.isOnline
                ? "You're online. Claim something from the pool, or wait for dispatch."
                : "Go online to start receiving job requests."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
