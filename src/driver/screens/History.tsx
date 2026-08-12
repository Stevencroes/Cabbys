// History — the receipt drawer.
//
// Drivers open this for one reason: disputes. "I did that Arikok run on
// Tuesday and I wasn't paid." Plainly chronological with the fare on every
// row, so most of those resolve before they reach you.
import { useEffect, useState } from "react";
import { loadCompleted, type AssignedJob, type DriverProfile } from "../lib/driver";
import { formatDate, formatTime, ARUBA_OFFSET_MINUTES, todayInAruba, addDays } from "../../lib/datetime";

function arubaParts(iso: string | null | undefined) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const s = new Date(t + ARUBA_OFFSET_MINUTES * 60_000).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

/** "Today · 11:20", "Yesterday · 09:05", else the full date. */
function whenLabel(iso: string | null | undefined): string {
  const p = arubaParts(iso);
  if (!p) return "—";
  const today = todayInAruba();
  const day =
    p.date === today ? "Today"
    : p.date === addDays(today, -1) ? "Yesterday"
    : formatDate(p.date);
  return `${day} · ${formatTime(p.time)}`;
}

export default function History({ driver }: { driver: DriverProfile }) {
  const [rides, setRides] = useState<AssignedJob[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCompleted(driver.id).then(({ jobs }) => { if (!cancelled) setRides(jobs); });
    return () => { cancelled = true; };
  }, [driver.id]);

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">History</div>
        <h1 className="big" style={{ fontSize: 30 }}>Completed.</h1>

        {rides === null ? (
          <div className="drv-empty"><p className="et">Loading your trips.</p></div>
        ) : rides.length === 0 ? (
          <div className="drv-empty">
            <div className="es">No trips yet.</div>
            <p className="et">Every completed job lands here with its fare, as your own record.</p>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {rides.map((r) => (
              <div className="drv-hrow" key={r.id}>
                <div className="drv-hav">{(r.contactName || "·").trim().charAt(0).toUpperCase()}</div>
                <div className="drv-hmain">
                  <div className="hr">{r.pickup} → {r.dropoff}</div>
                  <div className="hm">
                    {[whenLabel(r.completedAt ?? r.scheduledAt), r.vehicle].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="drv-hf">{r.fare != null ? `$${Math.round(r.fare)}` : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
