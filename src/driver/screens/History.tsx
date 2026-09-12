// History — the receipt drawer.
//
// Drivers open this for one reason: disputes. "I did that Arikok run on
// Tuesday and I wasn't paid." Everything here follows from that one
// sentence, and the flat list this replaced answered almost none of it.
//
//  · They arrive knowing a PLACE, not a date — "the Arikok run" — so
//    there is a search box, and it matches either end of the route, the
//    car, or the booking reference.
//  · They are arguing about a PERIOD, so the rides are banded by month
//    with the month's own count and total on the band. A dispute about
//    August is settled by a line that says August.
//  · They want to see the RIDE, not a summary of it — the guest, the
//    fare, the commission that came off it. Every row opens.
//
// The list is also finite and says so. It used to ask for 60 rides and
// render them with nothing to say whether that was all of them, which for
// a driver two months into a busy season is the difference between "I was
// never paid" and "I scrolled to the bottom of a page."
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RideRow from "../RideRow";
import { loadCompleted, type AssignedJob, type DriverProfile } from "../lib/driver";
import {
  formatDate, formatTime, arubaDayOf, ARUBA_OFFSET_MINUTES, todayInAruba, addDays,
  MONTHS_LONG,
} from "../../lib/datetime";

/** How many finished rides to ask for, and how much further each tap goes. */
const PAGE = 60;

/** Aruba's wall-clock time for a stored instant. */
function arubaTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  return formatTime(new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16));
}

/** "Today · 11:20 AM", "Yesterday · 9:05 AM", else the full date. */
function whenLabel(iso: string | null | undefined): string {
  const date = arubaDayOf(iso);
  if (!date) return "—";
  const today = todayInAruba();
  const day =
    date === today ? "Today"
    : date === addDays(today, -1) ? "Yesterday"
    : formatDate(date);
  return `${day} · ${arubaTime(iso)}`;
}

/** "August 2026" — the band a ride files under. */
function monthOf(iso: string | null | undefined): string {
  const date = arubaDayOf(iso);
  if (!date) return "Undated";
  return `${MONTHS_LONG[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/**
 * Does this ride answer what was typed?
 *
 * Deliberately generous: either end of the route, the car, and the
 * booking reference, matched case-insensitively anywhere in the string.
 * A driver looking for "arikok" should not have to know whether we filed
 * it as "Arikok National Park".
 */
function matches(job: AssignedJob, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.pickup, job.dropoff, job.vehicle, job.bookingRef, job.contactName]
    .some((v) => (v ?? "").toLowerCase().includes(q));
}

export default function History({ driver }: { driver: DriverProfile }) {
  const navigate = useNavigate();
  const [rides, setRides] = useState<AssignedJob[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  /** true while a "show more" is in flight, so the button can say so */
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (want: number) => {
      const { jobs } = await loadCompleted(driver.id, want);
      return jobs;
    },
    [driver.id],
  );

  useEffect(() => {
    let cancelled = false;
    void load(PAGE).then((jobs) => { if (!cancelled) setRides(jobs); });
    return () => { cancelled = true; };
  }, [load]);

  /** There may be more behind this page — ask for the next one. */
  async function more() {
    setLoadingMore(true);
    const want = limit + PAGE;
    const jobs = await load(want);
    setRides(jobs);
    setLimit(want);
    setLoadingMore(false);
  }

  const found = useMemo(() => (rides ?? []).filter((r) => matches(r, query)), [rides, query]);

  /** the rides banded by month, newest month first — loadCompleted
      already returns them newest-first, so insertion order is the order */
  const months = useMemo(() => {
    const m = new Map<string, AssignedJob[]>();
    for (const r of found) {
      const key = monthOf(r.completedAt ?? r.scheduledAt);
      const band = m.get(key);
      if (band) band.push(r); else m.set(key, [r]);
    }
    return [...m.entries()];
  }, [found]);

  const total = found.reduce((s, r) => s + (r.payoutUsd ?? 0), 0);
  /** a short page means the database had nothing more to give */
  const exhausted = rides !== null && rides.length < limit;

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">History</div>
        <h1 className="big" style={{ fontSize: 30 }}>Completed.</h1>

        {rides !== null && rides.length > 0 && (
          <>
            <div className="drv-stats">
              <div className="drv-srow">
                <div className="drv-scell">
                  <div className="drv-sk">{query ? "Trips found" : "Trips shown"}</div>
                  <div className="drv-sv">{found.length}</div>
                </div>
                <div className="drv-scell">
                  <div className="drv-sk">Paid for them</div>
                  <div className="drv-sv"><small>$</small>{Math.round(total).toLocaleString("en-US")}</div>
                </div>
              </div>
            </div>

            <div className="drv-find">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a place, a car, a reference"
                aria-label="Search your completed trips"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear the search">✕</button>
              )}
            </div>
          </>
        )}

        {rides === null ? (
          <div className="drv-empty"><p className="et">Loading your trips.</p></div>
        ) : rides.length === 0 ? (
          <div className="drv-empty">
            <div className="es">No trips yet.</div>
            <p className="et">Every completed job lands here with its fare, as your own record.</p>
          </div>
        ) : found.length === 0 ? (
          // Not "no trips" — the drawer is full, this search just missed.
          <div className="drv-empty">
            <div className="es">Nothing matches “{query}”.</div>
            <p className="et">Try a place name, the car, or the booking reference.</p>
          </div>
        ) : (
          <>
            {months.map(([month, list]) => (
              <section key={month}>
                <div className="drv-band">
                  <span className="bk">{month}</span>
                  <span className="bn">{list.length}</span>
                  <span className="bv">
                    ${Math.round(list.reduce((s, r) => s + (r.payoutUsd ?? 0), 0)).toLocaleString("en-US")}
                  </span>
                </div>
                {list.map((r) => (
                  <RideRow
                    key={r.id}
                    job={r}
                    mark={(r.contactName || "·").trim().charAt(0).toUpperCase()}
                    meta={[whenLabel(r.completedAt ?? r.scheduledAt), r.vehicle].filter(Boolean).join(" · ")}
                    onOpen={() => navigate(`/drive/ride/${r.id}`)}
                  />
                ))}
              </section>
            ))}

            {/* Say where the bottom is. A list that just stops is a list a
                driver has to guess the end of. */}
            {exhausted ? (
              <p className="sub" style={{ marginTop: 20, fontSize: "11.5px" }}>
                That's every trip you've completed.
              </p>
            ) : (
              <button
                type="button"
                className="drv-cta ghost"
                style={{ marginTop: 20 }}
                disabled={loadingMore}
                onClick={() => void more()}
              >
                {loadingMore ? "…" : "Show earlier trips"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
