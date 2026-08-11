// Ride detail — the screen the pin flow exists for.
//
// "Eagle Beach" is 2km of sand. The guest drops a pin from their own phone
// and the driver gets a map, a note and a Maps button. The note sits ABOVE
// the map and is set larger, in Amber, because coordinates get you within
// 20 metres and the landmark closes the last 20.
//
// One button walks the status forward, calling set_ride_status() each
// time. That function checks approval and ownership server-side, so a
// driver can never move someone else's ride.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jobDate, jobTime, shortPlace } from "../JobCard";
import { loadRide, setRideStatus, type AssignedJob, type RideStatus } from "../lib/driver";
import { formatFlightNumber } from "../../lib/flight";
import { normalizePhone } from "../../lib/contact";

/**
 * Aruba's bounding box, used to place the pin inside the sketch below.
 * The map is an illustration, not a tile layer — but the marker's
 * position is derived from the real coordinates, so a pin at Baby Beach
 * and one at Palm Beach don't land in the same spot. A badge that says
 * "Guest pinned" over a fixed marker would be a lie.
 */
const ARUBA_BOX = { west: -70.075, east: -69.865, south: 12.405, north: 12.630 };

function pinXY(lat: number, lng: number): { x: number; y: number } {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  const fx = clamp((lng - ARUBA_BOX.west) / (ARUBA_BOX.east - ARUBA_BOX.west));
  const fy = clamp((ARUBA_BOX.north - lat) / (ARUBA_BOX.north - ARUBA_BOX.south));
  // inset so the marker never clips the frame
  return { x: 34 + fx * (400 - 68), y: 30 + fy * (150 - 58) };
}

/** The walk: each status names the action that leaves it. */
const FLOW: { from: string; next: RideStatus; label: string; tone: "green" | "red" }[] = [
  { from: "driver_assigned", next: "en_route",    label: "I'm on my way", tone: "green" },
  { from: "en_route",        next: "arrived",     label: "I've arrived",  tone: "green" },
  { from: "arrived",         next: "in_progress", label: "Guest is aboard", tone: "red" },
  { from: "in_progress",     next: "completed",   label: "Complete trip", tone: "red" },
];

export default function RideDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState<AssignedJob | null | "missing">(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await loadRide(id);
    setRide(r ?? "missing");
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (ride === null) {
    return <div className="drv-view"><div className="drv-empty" style={{ paddingTop: 60 }}><p className="et">Loading the job.</p></div></div>;
  }

  if (ride === "missing") {
    return (
      <div className="drv-view">
        <div className="drv-gate">
          <div className="gi mark">?</div>
          <h1>This job isn't yours.</h1>
          <p>It may have been reassigned, or the link is out of date.</p>
          <button type="button" className="drv-cta ghost" onClick={() => navigate("/drive")}>Back to today</button>
        </div>
      </div>
    );
  }

  const step = FLOW.find((s) => s.from === ride.status);
  const hasPin = ride.pickupLat != null && ride.pickupLng != null;
  const mapsHref = hasPin
    ? `https://maps.google.com/?daddr=${ride.pickupLat},${ride.pickupLng}`
    : `https://maps.google.com/?daddr=${encodeURIComponent(ride.pickup)}`;
  const initial = (ride.contactName || "?").trim().charAt(0).toUpperCase();
  const phone = ride.contactPhone ? normalizePhone(ride.contactPhone) : null;

  const party = [
    ride.passengers != null ? `${ride.passengers} guest${ride.passengers === 1 ? "" : "s"}` : null,
    ride.luggage ? `${ride.luggage} bags` : null,
    ride.childSeats ? `${ride.childSeats} child seat${ride.childSeats > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  async function advance() {
    if (!step || ride === null || ride === "missing") return;
    setBusy(true);
    const ok = await setRideStatus(ride.id, step.next);
    setBusy(false);
    if (ok) {
      if (step.next === "completed") navigate("/drive");
      else void load();
    }
  }

  return (
    <div className="drv-view">
      <div className="drv-dhead">
        <div className="dk">{jobDate(ride.scheduledAt)} · {jobTime(ride.scheduledAt)}</div>
        <h1>{shortPlace(ride.pickup)} →<br />{shortPlace(ride.dropoff)}</h1>
        <div className="ref">
          {[ride.bookingRef, ride.vehicle].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      <div className="drv-pinmap">
        <svg viewBox="0 0 400 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="400" height="150" fill="#211812" />
          <path d="M0,0 L70,0 C55,50 80,100 45,150 L0,150 Z" fill="#1a120d" />
          <path d="M70,0 C55,50 80,100 45,150" fill="none" stroke="#E2A03F" strokeWidth="3" opacity=".45" />
          <g stroke="#4A3A2D" strokeWidth="1.5" fill="none">
            <line x1="140" y1="0" x2="140" y2="150" /><line x1="250" y1="0" x2="250" y2="150" />
            <line x1="0" y1="60" x2="400" y2="60" /><line x1="0" y1="110" x2="400" y2="110" />
          </g>
          <ellipse cx="320" cy="40" rx="60" ry="34" fill="#4C5A33" opacity=".2" />
          {hasPin && (
            <g transform={(() => { const { x, y } = pinXY(ride.pickupLat!, ride.pickupLng!); return `translate(${x.toFixed(1)},${y.toFixed(1)})`; })()}>
              <circle r="18" fill="#C6452C" opacity=".22" />
              <path d="M0,-19 C10,-19 15,-11 15,-4 C15,5 0,15 0,15 C0,15 -15,5 -15,-4 C-15,-11 -10,-19 0,-19 Z" fill="#C6452C" />
              <circle cx="0" cy="-4" r="5" fill="#F2E9D5" />
            </g>
          )}
        </svg>
        <span className={`drv-pinbadge${hasPin ? "" : " wait"}`}>
          {hasPin ? "Guest pinned" : "No pin yet"}
        </span>
      </div>

      <div className="drv-pad" style={{ paddingTop: 16 }}>
        {ride.pickupNote && (
          <div className="drv-note">
            <div className="nk">Guest note</div>
            <div className="nv">“{ride.pickupNote}”</div>
          </div>
        )}

        <div className="drv-pax">
          <span className="av">{initial}</span>
          <span className="pi">
            <span className="pn">{ride.contactName || "Guest"}</span>
            <span className="pm">{party || "—"}</span>
          </span>
          {phone && (
            <span className="pc">
              <a href={`tel:${phone}`} aria-label={`Call ${ride.contactName || "guest"}`}>✆</a>
              <a
                href={`https://wa.me/${phone.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Message ${ride.contactName || "guest"}`}
              >✉</a>
            </span>
          )}
        </div>

        <div className="drv-rowset">
          {ride.flightNumber && (
            <div className="drv-r">
              <span className="rl">Flight</span>
              <span className="rv">{formatFlightNumber(ride.flightNumber)} — tracked</span>
            </div>
          )}
          <div className="drv-r"><span className="rl">Pick up</span><span className="rv">{ride.pickup}</span></div>
          <div className="drv-r"><span className="rl">Drop off</span><span className="rv">{ride.dropoff}</span></div>
          {ride.vehicle && <div className="drv-r"><span className="rl">Vehicle</span><span className="rv">{ride.vehicle}</span></div>}
          <div className="drv-r">
            <span className="rl">Fare</span>
            <span className="rv hl">{ride.fare != null ? `$${Math.round(ride.fare)}` : "—"}</span>
          </div>
        </div>

        <a className="drv-cta ghost" href={mapsHref} target="_blank" rel="noreferrer">Open in Maps ↗</a>
      </div>

      <div className="drv-actionbar">
        <div className="inner">
          {step ? (
            <button type="button" className={`drv-cta ${step.tone}`} onClick={() => void advance()} disabled={busy}>
              {busy ? "…" : step.label}
            </button>
          ) : (
            <button type="button" className="drv-cta ghost" onClick={() => navigate("/drive")}>
              {ride.status === "completed" ? "Completed ✓" : "Back to today"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
