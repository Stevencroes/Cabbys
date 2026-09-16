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
//
// Two orders, because there are two ways a driver picks work and the screen
// used to allow only one. Soonest is the diary question — what can I fit
// before the school run. Best paid is the earnings question — what is the
// best hour I can buy today. Neither is the "right" default; soonest is
// simply the one that matches how the jobs are grouped.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PoolCard from "../PoolCard";
import { jobDate, jobDateShort, jobTime } from "../JobCard";
import { claimRide, isImminent, loadOpen, type OpenJob } from "../lib/driver";
import { todayInAruba, addDays, arubaDayOf } from "../../lib/datetime";

type Order = "soonest" | "paid";

/** "Today", "Tomorrow", else "Fri 12 Sep". Unscheduled work says so. */
function groupLabel(iso: string | null): string {
  const day = arubaDayOf(iso);
  if (!day) return "No date set";
  const today = todayInAruba();
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return jobDateShort(iso) || jobDate(iso);
}

export default function Pool() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<OpenJob[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const [booked, setBooked] = useState<OpenJob | null>(null);
  const [order, setOrder] = useState<Order>("soonest");

  // A ride just handed back arrives here with its id, because RideDetail
  // navigates the instant release_ride() returns and this query can beat
  // the write home. Claiming already survives that race the same way. The
  // wait is spent only on a load that is owed a specific ride — an ordinary
  // pool load, and every refresh after the first, reads once as before.
  const handback = (useLocation().state as { released?: string } | null)?.released ?? null;
  const owed = useRef<string | null>(handback);

  const refresh = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { jobs: rows, error } = await loadOpen();
      const waitingFor = owed.current;
      const there = waitingFor !== null && rows.some((j) => j.id === waitingFor);
      // Last attempt shows whatever the pool really holds. A ride that
      // never comes back is a fact the driver should see, not one to hide
      // behind a spinner — an admin may have reassigned it in that second.
      if (error !== null || waitingFor === null || there || attempt === 2) {
        owed.current = null;
        setFailed(error);
        setJobs(rows);
        return;
      }
      await new Promise((done) => setTimeout(done, 500));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function accept(job: OpenJob) {
    setBusy(job.id);
    setRefused(null);
    setBooked(null);
    const res = await claimRide(job.id);
    setBusy(null);

    if (res.ok) {
      // A job days out is scheduling, not dispatch: it belongs in the
      // roster, not on the "I'm on my way" screen.
      if (isImminent(job)) navigate(`/drive/ride/${res.rideId}`);
      else { setBooked(job); void refresh(); }
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

  /**
   * Soonest keeps the day grouping, because the days are the point.
   * Best paid throws the grouping away on purpose: a list sorted by money
   * and then chopped into date headings is sorted by neither.
   */
  const groups = useMemo(() => {
    const list = jobs ?? [];
    if (order === "paid") {
      const sorted = [...list].sort((a, b) => (b.payoutUsd ?? 0) - (a.payoutUsd ?? 0));
      return [["Best paid first", sorted] as const];
    }
    const m = new Map<string, OpenJob[]>();
    for (const j of list) {
      const key = groupLabel(j.scheduledAt);
      const bucket = m.get(key);
      if (bucket) bucket.push(j); else m.set(key, [j]);
    }
    return [...m.entries()].map(([k, v]) => [k, v] as const);
  }, [jobs, order]);

  const count = jobs?.length ?? 0;
  const best = Math.max(0, ...(jobs ?? []).map((j) => j.payoutUsd ?? 0));

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">Open pool · unassigned</div>
        <h1 className="big">Free to <em>claim.</em></h1>
        <p className="sub" style={{ marginTop: 8 }}>
          First to accept gets the job. Every figure below is your payout, not the guest's fare.
        </p>

        {booked && (
          <div className="drv-refused ok" role="status">
            <div className="rk">Booked in</div>
            <p>
              {jobDate(booked.scheduledAt)} · {jobTime(booked.scheduledAt)} — it's in your schedule.
            </p>
            <button type="button" className="drv-cta ghost" style={{ marginTop: 12 }}
              onClick={() => navigate("/drive")}>
              See the schedule
            </button>
          </div>
        )}

        {refused && (
          <div className="drv-refused" role="alert">
            <div className="rk">Couldn't take that job</div>
            <p>{refused}</p>
          </div>
        )}

        {count > 0 && (
          <>
            <div className="drv-stats">
              <div className="drv-srow">
                <div className="drv-scell">
                  <div className="drv-sk">Jobs open</div>
                  <div className="drv-sv">{count}</div>
                </div>
                <div className="drv-scell">
                  <div className="drv-sk">Best pays</div>
                  <div className="drv-sv"><small>$</small>{Math.round(best)}</div>
                </div>
              </div>
            </div>

            <div className="drv-seg drv-span" role="group" aria-label="Order the pool">
              <button
                type="button" className={order === "soonest" ? "on" : ""}
                aria-pressed={order === "soonest"} onClick={() => setOrder("soonest")}
              >Soonest</button>
              <button
                type="button" className={order === "paid" ? "on" : ""}
                aria-pressed={order === "paid"} onClick={() => setOrder("paid")}
              >Best paid</button>
            </div>
          </>
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
            {groups.map(([day, list]) => (
              <div key={day}>
                <div className="drv-poolday">
                  <span className="pd-k">{day}</span>
                  <span className="pd-n">{list.length}</span>
                </div>
                {list.map((j) => (
                  <PoolCard
                    key={j.id}
                    job={j}
                    busy={busy === j.id}
                    disabled={busy !== null}
                    leaving={leaving.includes(j.id)}
                    onAccept={() => void accept(j)}
                  />
                ))}
              </div>
            ))}
            <p className="sub foot" style={{ marginTop: 18 }}>
              No guest names or numbers shown until a job is yours.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
