// Open pool — first to accept gets the job.
//
// Reads the open_rides VIEW, never the rides table, so route, time, class
// and fare are visible but the guest's name, number and pin are not. Those
// unlock only once the job is theirs.
//
// Accepting calls claim_ride(), which is atomic. Two drivers tapping in the
// same second cannot both win: the loser gets 'already_taken' and their
// card simply leaves. That is a normal outcome, not a failure, so it never
// raises a dialog.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import JobCard, { jobDate, jobTime } from "../JobCard";
import { claimRide, loadOpen, type OpenJob } from "../lib/driver";

export default function Pool() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<OpenJob[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [refused, setRefused] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { jobs: rows, error } = await loadOpen();
    setFailed(error);
    setJobs(rows);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function accept(job: OpenJob) {
    setBusy(job.id);
    setRefused(null);
    const res = await claimRide(job.id);
    setBusy(null);

    if (res.ok) {
      navigate(`/drive/ride/${res.rideId}`);
      return;
    }
    if (res.error === "already_taken") {
      // someone was faster — retire the card quietly and resync
      setLeaving((l) => [...l, job.id]);
      setTimeout(() => {
        setJobs((prev) => prev?.filter((j) => j.id !== job.id) ?? null);
        setLeaving((l) => l.filter((id) => id !== job.id));
        void refresh();
      }, 500);
      return;
    }
    // Everything else is a real refusal and must be visible. Silently
    // refreshing here made a failing Accept look like a dead button —
    // the driver taps, nothing moves, and there is nothing to report.
    setRefused(
      res.error === "not_approved"
        ? "Your account isn't approved to take jobs yet."
        : res.detail ?? "The claim was refused.",
    );
    void refresh();
  }

  const groups = new Map<string, OpenJob[]>();
  for (const j of jobs ?? []) {
    const key = jobDate(j.scheduledAt) || "Unscheduled";
    const list = groups.get(key) ?? [];
    list.push(j);
    groups.set(key, list);
  }

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">Open pool · unassigned</div>
        <h1 className="big">Free to <em>claim.</em></h1>
        <p className="sub" style={{ marginTop: 8 }}>First to accept gets the job.</p>

        {refused && (
          <div className="drv-refused" role="alert">
            <div className="rk">Couldn't take that job</div>
            <p>{refused}</p>
          </div>
        )}

        {jobs === null ? (
          <div className="drv-empty" style={{ paddingTop: 40 }}><p className="et">Checking the pool.</p></div>
        ) : failed ? (
          // Not "empty" — the pool could not be read at all. Said plainly,
          // with the database's own words, because the fix is in Supabase
          // and not on this screen.
          <div className="drv-empty" role="alert">
            <div className="es">Can't reach the pool.</div>
            <p className="et">
              Bookings aren't being blocked — this portal just can't read them. Run the
              latest docs/driver-schema.sql, then try again.
            </p>
            <p className="et mono" style={{ marginTop: 10, opacity: 0.7 }}>{failed}</p>
            <button type="button" className="drv-cta ghost" style={{ marginTop: 14 }} onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="drv-empty">
            <div className="es">Pool's empty.</div>
            <p className="et">Every booked ride already has a driver. New ones land here first.</p>
          </div>
        ) : (
          <>
            {[...groups.entries()].map(([day, list]) => (
              <div key={day}>
                <div className="kick" style={{ margin: "20px 0 12px" }}>{day}</div>
                {list.map((j) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    chip={{ tone: "", label: jobTime(j.scheduledAt) }}
                    headline={j.fare != null ? `$${Math.round(j.fare)}` : "—"}
                    leaving={leaving.includes(j.id)}
                    action={{
                      label: busy === j.id ? "…" : "Accept",
                      onClick: () => void accept(j),
                      disabled: busy !== null,
                    }}
                  />
                ))}
              </div>
            ))}
            <p className="sub" style={{ marginTop: 18, fontSize: "11.5px" }}>
              No guest names or numbers shown until a job is yours.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
