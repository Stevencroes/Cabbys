// Earnings — the screen that decides whether a driver trusts you.
//
// It's the second-most-opened screen in any driver app, so vagueness here
// costs drivers faster than anything else: show the total, the breakdown
// and the payout date. Everything sums completed work only, bucketed by
// completed_at — a job booked Friday and driven Saturday is Saturday's.
import { useEffect, useMemo, useState } from "react";
import { loadCompleted, type AssignedJob, type DriverProfile } from "../lib/driver";
import { ARUBA_OFFSET_MINUTES, todayInAruba } from "../../lib/datetime";

type Range = "week" | "today";
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Aruba's calendar day for a stored instant. */
function arubaDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** The seven ISO dates of the current Aruba week, Monday first. */
function weekDays(today: string): string[] {
  const noon = new Date(`${today}T12:00:00Z`);
  const dow = (noon.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(noon.getTime() - dow * 86_400_000);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

export default function Earnings({ driver }: { driver: DriverProfile }) {
  const [range, setRange] = useState<Range>("week");
  const [rides, setRides] = useState<AssignedJob[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCompleted(driver.id).then((rows) => { if (!cancelled) setRides(rows); });
    return () => { cancelled = true; };
  }, [driver.id]);

  const today = todayInAruba();
  const days = useMemo(() => weekDays(today), [today]);

  const byDay = useMemo(() => {
    const m = new Map<string, { total: number; jobs: number }>();
    for (const r of rides ?? []) {
      const d = arubaDay(r.completedAt ?? r.scheduledAt);
      if (!d) continue;
      const cur = m.get(d) ?? { total: 0, jobs: 0 };
      cur.total += r.fare ?? 0;
      cur.jobs += 1;
      m.set(d, cur);
    }
    return m;
  }, [rides]);

  const scope = range === "today" ? [today] : days;
  const total = scope.reduce((s, d) => s + (byDay.get(d)?.total ?? 0), 0);
  const jobs = scope.reduce((s, d) => s + (byDay.get(d)?.jobs ?? 0), 0);
  const peak = Math.max(...days.map((d) => byDay.get(d)?.total ?? 0), 0);

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">Earnings</div>

        <div className="drv-seg" role="group" aria-label="Range">
          <button type="button" className={range === "week" ? "on" : ""} onClick={() => setRange("week")}
            aria-pressed={range === "week"}>This week</button>
          <button type="button" className={range === "today" ? "on" : ""} onClick={() => setRange("today")}
            aria-pressed={range === "today"}>Today</button>
        </div>

        <div className="drv-etot">
          <div className="ek">Net earned</div>
          <div className="ev">${Math.round(total).toLocaleString("en-US")}</div>
          <div className="ed">
            {range === "today" ? "Today" : "Mon–Sun"} · {jobs} job{jobs === 1 ? "" : "s"}
          </div>
        </div>

        <div className="drv-chart" aria-hidden="true">
          {days.map((d, i) => {
            const v = byDay.get(d)?.total ?? 0;
            const pct = peak > 0 ? Math.max((v / peak) * 100, v > 0 ? 6 : 2) : 2;
            const cls = v > 0 && v === peak ? "peak" : v > 0 ? "mid" : "";
            return (
              <div key={d} className={`drv-bar ${cls}`}>
                <div className="bfill" style={{ height: `${pct}%` }} />
                <div className="bl">{DAY_LETTERS[i]}</div>
              </div>
            );
          })}
        </div>

        <div className="drv-stats" style={{ marginTop: 0 }}>
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
              <div className="drv-sk">Trips</div>
              <div className="drv-sv">{driver.tripsCount}</div>
            </div>
          </div>
        </div>

        <div className="drv-payout">
          <div className="pk">Next payout</div>
          <div className="pv">
            ${Math.round(days.reduce((s, d) => s + (byDay.get(d)?.total ?? 0), 0)).toLocaleString("en-US")} · Monday
          </div>
          {/* TODO: confirm the payout schedule and account tail with the client */}
          <div className="pd">Paid weekly to your registered account.</div>
        </div>

        {rides !== null && rides.length === 0 && (
          <div className="drv-empty">
            <div className="es">Nothing earned yet.</div>
            <p className="et">Completed trips show up here the moment you close them.</p>
          </div>
        )}
      </div>
    </div>
  );
}
