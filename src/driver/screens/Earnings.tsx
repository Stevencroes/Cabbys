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
import { useEffect, useMemo, useState } from "react";
import { loadCompleted, type AssignedJob, type DriverProfile } from "../lib/driver";
import { ARUBA_OFFSET_MINUTES, todayInAruba, formatTime } from "../../lib/datetime";
import { COMMISSION_RATE } from "../../lib/quote";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Aruba's calendar day for a stored instant. */
function arubaDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Aruba's wall-clock time for a stored instant. */
function arubaTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return formatTime(new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16));
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
  const [rides, setRides] = useState<AssignedJob[] | null>(null);
  /** an ISO date when one day is open, null for the whole week */
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCompleted(driver.id).then(({ jobs }) => { if (!cancelled) setRides(jobs); });
    return () => { cancelled = true; };
  }, [driver.id]);

  const today = todayInAruba();
  const days = useMemo(() => weekDays(today), [today]);

  /** every completed ride of this week, filed under its Aruba day */
  const byDay = useMemo(() => {
    const m = new Map<string, AssignedJob[]>();
    for (const r of rides ?? []) {
      const d = arubaDay(r.completedAt ?? r.scheduledAt);
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

        <div className="drv-etot">
          <div className="ek">{day ? "Earned" : "Your earnings"}</div>
          <div className="ev">${Math.round(total).toLocaleString("en-US")}</div>
          <div className="ed">
            {scopeLabel} · {jobs} job{jobs === 1 ? "" : "s"} · after {Math.round(COMMISSION_RATE * 100)}% Cabby's
          </div>
        </div>

        {/* Bars are buttons. A driver who can open Tuesday and count the
            three rides that made it never has to ask you what the total
            means — which is most of what the history screen is for. */}
        <div className="drv-chart" role="group" aria-label="Earnings by day, this week">
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
              <div className="drv-hrow" key={r.id}>
                <div className="drv-hav">{arubaTime(r.completedAt ?? r.scheduledAt).slice(0, 2) || "·"}</div>
                <div className="drv-hmain">
                  <div className="hr">{r.pickup} → {r.dropoff}</div>
                  <div className="hm">
                    {[arubaTime(r.completedAt ?? r.scheduledAt), r.vehicle].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="drv-hf">{r.payoutUsd != null ? `$${Math.round(r.payoutUsd)}` : "—"}</div>
              </div>
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
              <div className="drv-sk">Trips</div>
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
        <div className="drv-payout">
          <div className="pk">Earned this week</div>
          <div className="pv">${Math.round(days.reduce((s, d) => s + paidOn(d), 0)).toLocaleString("en-US")}</div>
          <div className="pd">
            Cabby's confirms your payout schedule directly. This is your completed work
            Monday to Sunday, after the {Math.round(COMMISSION_RATE * 100)}% commission.
          </div>
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
