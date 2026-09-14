// The schedule — one day, read down the clock.
//
// A day rather than a week, because a dispatch board's question is
// "what is happening today, and where are the gaps": a week grid on an
// island with four cars is seven columns of white space. The week is
// still there, as a seven-day strip that doubles as the day picker —
// each day showing how many rides it holds and how many of those nobody
// is driving. That strip is the only week view worth having here: it
// answers "which day needs me" in one glance and then gets out of the
// way.
//
// EMPTY HOURS ARE DRAWN. A gap is information on a dispatch board — it
// is where the next booking fits, and it is why the 6am and the 11pm
// look nothing alike. They are drawn quietly, at a fraction of the
// weight of an hour with work in it, so the day still reads as a shape.
//
// What this screen marks, because the brief asks for exactly these and
// the data supports exactly these:
//
//   unassigned        a ride nobody is driving — the alert rule
//   collision         one driver on two rides inside 90 minutes
//   driver on hold    a suspended driver still holding the job
//
// "Unavailable vehicle" is not among them, and cannot be: a vehicle in
// this database is six columns on a driver, with no availability of its
// own beyond whether that driver is on duty. What a real fleet would
// take is written down in the report this work came with.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDays, arubaDayOf, formatDateShort, todayInAruba, weekDays, weekdayShort, weekRangeLabel,
} from "../../lib/datetime";
import { jobTime, shortAirport } from "../../driver/JobCard";
import { useBoard } from "../BoardContext";
import { isClosed, needsDriver, type AdminRide } from "../lib/admin";
import { collisions } from "../lib/attention";
import { Chip, Empty, Head, Section, Skeleton, Unreadable, rideState } from "../ui";

/** Aruba's hour for a stored instant, as a number. */
function hourOf(iso: string | null): number | null {
  const day = arubaDayOf(iso);
  if (!day || !iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Number(new Date(t - 4 * 3_600_000).toISOString().slice(11, 13));
}

export default function Schedule() {
  const { rides, ridesError, drivers, loading, refresh } = useBoard();
  const [day, setDay] = useState(() => todayInAruba());
  const today = todayInAruba();

  const clash = useMemo(() => collisions(rides), [rides]);
  const suspended = useMemo(
    () => new Set(drivers.filter((d) => d.status === "suspended").map((d) => d.id)),
    [drivers],
  );

  const week = weekDays(day);
  // A ride with no date at all belongs to no day, so it would appear on
  // none of them — invisible on the one screen whose job is to notice
  // what is not covered. It is filed under TODAY, because today is where
  // the operator is standing, and it is drawn under its own heading so
  // nobody reads it as a booking at midnight.
  const onDay = useMemo(
    () => rides
      .filter((r) => arubaDayOf(r.scheduledAt) === day || (day === today && !r.scheduledAt))
      .sort((a, b) => String(a.scheduledAt ?? "").localeCompare(String(b.scheduledAt ?? ""))),
    [rides, day, today],
  );

  /** the span of hours worth drawing: first booking to last, and nothing
      outside it — a day that starts at 05:00 should not open with five
      empty rows */
  const hours = useMemo(() => {
    const hs = onDay.map((r) => hourOf(r.scheduledAt)).filter((h): h is number => h !== null);
    if (!hs.length) return [];
    const from = Math.min(...hs);
    const to = Math.max(...hs);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [onDay]);

  const undated = onDay.filter((r) => hourOf(r.scheduledAt) === null);
  const openCount = onDay.filter(needsDriver).length;

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <Head
          kick={`Schedule · ${weekRangeLabel(day)}`}
          title={<>The <em>day.</em></>}
          lead="One day at a time, down the clock. The gaps are where the next booking fits."
        />

        {ridesError ? (
          <Unreadable
            what="rides"
            detail={ridesError}
            reassure="Bookings aren't being blocked — this board just can't see them."
            onRetry={() => void refresh()}
          />
        ) : loading ? (
          <Skeleton rows={6} />
        ) : (
          <>
            {/* the week, as a picker that also answers "which day needs me" */}
            <div className="adm-week" role="group" aria-label="Pick a day">
              <button type="button" className="adm-weekstep" onClick={() => setDay(addDays(day, -7))}
                aria-label="The week before">←</button>
              {week.map((d) => {
                const n = rides.filter((r) => arubaDayOf(r.scheduledAt) === d);
                const gaps = n.filter(needsDriver).length;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`adm-weekday${d === day ? " on" : ""}${d === today ? " now" : ""}`}
                    aria-pressed={d === day}
                    onClick={() => setDay(d)}
                  >
                    <span className="wd">{weekdayShort(d)}</span>
                    <span className="wn">{d.slice(8)}</span>
                    {/* the count is a number, and the word for what it is
                        sits under it — never a bare coloured dot */}
                    <span className="wc">{n.length === 0 ? "—" : `${n.length} ride${n.length === 1 ? "" : "s"}`}</span>
                    {gaps > 0 && <span className="wg">{gaps} open</span>}
                  </button>
                );
              })}
              <button type="button" className="adm-weekstep" onClick={() => setDay(addDays(day, 7))}
                aria-label="The week after">→</button>
            </div>

            <Section
              title={d0(day, today)}
              aside={
                <>
                  <span>{formatDateShort(day)}</span>
                  <span>{onDay.length} ride{onDay.length === 1 ? "" : "s"}</span>
                  {openCount > 0 && <span className="adm-warnword">{openCount} with no driver</span>}
                  {day !== today && (
                    <button type="button" className="adm-quiet" onClick={() => setDay(today)}>Back to today</button>
                  )}
                </>
              }
            >
              {onDay.length === 0 ? (
                <Empty
                  line={day === today ? "Nothing booked today." : "Nothing booked that day."}
                  hint="A booking appears here the moment it is made — and on the strip above, so you can see which day is filling up."
                />
              ) : (
                <div className="adm-day">
                  {hours.map((h) => {
                    const at = onDay.filter((r) => hourOf(r.scheduledAt) === h);
                    return (
                      <div key={h} className={`adm-hour${at.length ? "" : " quiet"}`}>
                        <div className="adm-hourk">{String(h).padStart(2, "0")}:00</div>
                        <div className="adm-hourv">
                          {at.length === 0 ? "Nothing booked" : at.map((r) => (
                            <Slot
                              key={r.id}
                              ride={r}
                              clashes={clash.get(r.id)?.length ?? 0}
                              onHold={Boolean(r.driverId && suspended.has(r.driverId))}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* A ride with no time is broken and belongs on the one
                      screen that can fix it, not hidden because it will
                      not sort. */}
                  {undated.length > 0 && (
                    <div className="adm-hour">
                      <div className="adm-hourk">No time</div>
                      <div className="adm-hourv">
                        {undated.map((r) => <Slot key={r.id} ride={r} clashes={0} onHold={false} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/** "Today" reads better than the date the operator is already looking
    at in the strip; any other day says which one it is. */
function d0(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDateShort(day);
}

function Slot({ ride: r, clashes, onHold }: { ride: AdminRide; clashes: number; onHold: boolean }) {
  const state = rideState(r);
  return (
    <Link className={`adm-slot${needsDriver(r) ? " wants" : ""}${isClosed(r) ? " past" : ""}`} to={`/admin/rides/${r.id}`}>
      <span className="st">{r.scheduledAt ? jobTime(r.scheduledAt) : "—"}</span>
      <span className="sm">
        <span className="a">{shortAirport(r.pickup) || "—"} → {shortAirport(r.dropoff) || "—"}</span>
        <span className="b">
          {[r.guestName || "No name", r.vehicle, r.driverName || (r.driverId ? "assigned" : "nobody driving it")]
            .filter(Boolean).join(" · ")}
        </span>
        {/* Every warning is a sentence. The row's own accent rule says
            the same thing a second time, never the first. */}
        {clashes > 0 && (
          <span className="sw">
            {r.driverName || "This driver"} is on {clashes === 1 ? "another ride" : `${clashes} other rides`} within 90 minutes
          </span>
        )}
        {onHold && <span className="sw">The driver holding this is on hold and can't take new work</span>}
      </span>
      <span className="se"><Chip tone={state.tone}>{state.label}</Chip></span>
    </Link>
  );
}
