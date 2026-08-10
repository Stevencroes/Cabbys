// Dashboard — the screen a driver glances at between jobs.
//
// Order matters: who you are, whether you're taking work, how the day is
// going, and then the next job pinned directly under the stats. That last
// one is the most important element here, so nothing sits above it that
// isn't answering "am I working, and how's today going".
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import JobCard from "../JobCard";
import { loadAssigned, setOnline, type AssignedJob, type DriverProfile } from "../lib/driver";

function hoursLabel(h: number): string {
  if (h <= 0) return "0";
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins ? `${whole}h ${mins}m` : `${whole}h`;
}

export default function Dashboard({ driver }: { driver: DriverProfile }) {
  const navigate = useNavigate();
  const [online, setOnlineState] = useState(driver.isOnline);
  const [jobs, setJobs] = useState<AssignedJob[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAssigned(driver.id).then((rows) => { if (!cancelled) setJobs(rows); });
    return () => { cancelled = true; };
  }, [driver.id]);

  const toggle = useCallback(() => {
    const next = !online;
    setOnlineState(next);      // optimistic — the switch must feel instant
    void setOnline(next);
  }, [online]);

  const next = jobs?.[0] ?? null;
  const today = jobs ?? [];
  // Earnings and hours come from completed work; until that history exists
  // they read as zero rather than inventing a number.
  const earned = today.reduce((sum, j) => sum + (j.fare ?? 0), 0);

  return (
    <>
      <div className="drv-top">
        <div>
          <h1>{driver.fullName || "Driver"}</h1>
          <span className="lbl" style={{ display: "block", marginTop: 6 }}>
            {driver.rating != null ? `${driver.rating.toFixed(1)} ★ · ` : ""}
            {driver.tripsCount} trip{driver.tripsCount === 1 ? "" : "s"}
          </span>
        </div>
        <span className="drv-brand">Cabby<span className="ap">'</span>s</span>
      </div>

      <button
        type="button"
        className={`drv-toggle${online ? " on" : ""}`}
        onClick={toggle}
        aria-pressed={online}
      >
        <span className="tg-txt">
          <span className="tg-k num">{online ? "Online" : "Offline"}</span>
          <span className="tg-s">
            {online ? "Job requests are coming in" : "You're not receiving requests"}
          </span>
        </span>
        <span className="tg-sw" aria-hidden="true"><span className="tg-knob" /></span>
      </button>

      <div className="drv-card" style={{ marginTop: 14 }}>
        <div className="drv-stats">
          <div className="cell">
            <span className="v num">{today.length}</span>
            <span className="k">Trips today</span>
          </div>
          <div className="cell">
            <span className="v num money">${Math.round(earned)}</span>
            <span className="k">Earned</span>
          </div>
          <div className="cell">
            <span className="v num">{hoursLabel(0)}</span>
            <span className="k">Online hours</span>
          </div>
        </div>
      </div>

      <div className="drv-sec">
        <h2>Next job</h2>
        {online && (
          <span className="drv-live lbl"><span className="pip" aria-hidden="true" />Listening</span>
        )}
      </div>

      {jobs === null ? (
        <div className="drv-empty"><p>Loading your day.</p></div>
      ) : next ? (
        <JobCard job={next} highlight onOpen={() => navigate(`/drive/ride/${next.id}`)} />
      ) : (
        <div className="drv-empty">
          <span className="num">Nothing yet.</span>
          <p>
            {online
              ? "You're online. The next job lands here the moment it's yours."
              : "Go online to start receiving job requests."}
          </p>
        </div>
      )}
    </>
  );
}
