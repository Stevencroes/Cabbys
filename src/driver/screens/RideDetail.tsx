// Ride detail — the screen the pin flow exists for, and the one screen a
// driver is actually holding while the job happens.
//
// "Eagle Beach" is 2km of sand. The guest drops a pin from their own phone
// and the driver gets a map, a note and a Maps button. The note sits ABOVE
// the map and is set larger, in the amber card, because coordinates get
// you within 20 metres and the landmark closes the last 20.
//
// One button walks the status forward, calling set_ride_status() each
// time. That function checks approval and ownership server-side, so a
// driver can never move someone else's ride.
//
// Four things were wrong in here, and all four had the same shape — the
// screen knew something and didn't say it:
//
//  · There was no way out. The portal runs this route bare — no top bar,
//    no tabs — so a driver who opened a job could not leave it without
//    finishing it. Claiming a ride from the pool meant being locked into
//    the ride. Hence the bar at the top.
//  · A refused step did nothing visible. setRideStatus returned a bare
//    boolean and a false was dropped on the floor: tap "I've arrived",
//    watch the button un-press, and the ride stays where it was. It now
//    carries the database's reason and this screen prints it.
//  · A step could not be taken back. Tapping "Guest is aboard" a minute
//    early left the driver stuck in a state they hadn't reached.
//  · The map was an invented one. A pin plotted onto a hand-drawn
//    rectangle is not a location — it is a picture of a location. With a
//    Maps key there is now a real map at door-level zoom, and without one
//    the fallback is the same island sketch the passenger site draws,
//    from the real coastline, labelled as a sketch.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jobDate, jobTime, relativeWhen, shortPlace } from "../JobCard";
import { loadRide, setRideStatus, type AssignedJob, type RideStatus } from "../lib/driver";
import { awgToUsd, COMMISSION_RATE } from "../../lib/quote";
import { islandPath, pinMapUrl, project, type Coord } from "../../lib/route";
import { googleMapsEnabled, reportGoogleMapsFailure } from "../../lib/googleMaps";
import { formatFlightNumber } from "../../lib/flight";
import { normalizePhone } from "../../lib/contact";

/** The walk: each status names the action that leaves it. */
const FLOW: { from: string; next: RideStatus; label: string; tone: "green" | "red" }[] = [
  { from: "driver_assigned", next: "en_route",    label: "I'm on my way", tone: "green" },
  { from: "en_route",        next: "arrived",     label: "I've arrived",  tone: "green" },
  { from: "arrived",         next: "in_progress", label: "Guest is aboard", tone: "red" },
  { from: "in_progress",     next: "completed",   label: "Complete trip", tone: "red" },
];

/** The same walk, read as a position rather than as an action. */
const STAGES: { status: string; label: string }[] = [
  { status: "driver_assigned", label: "Booked" },
  { status: "en_route",        label: "On the way" },
  { status: "arrived",         label: "At pickup" },
  { status: "in_progress",     label: "Aboard" },
  { status: "completed",       label: "Done" },
];

/**
 * One step back, where the database allows one.
 *
 * set_ride_status() accepts only the four statuses a driver can move a
 * ride INTO, and 'driver_assigned' is not among them — so "I'm on my way"
 * is the one tap that cannot be taken back here, and the screen doesn't
 * offer an undo that would be refused.
 */
const UNDO: Partial<Record<string, { to: RideStatus; label: string }>> = {
  arrived:     { to: "en_route", label: "Undo — still on the way" },
  in_progress: { to: "arrived",  label: "Undo — waiting at pickup" },
};

const MAP_HEIGHT = 170;
/* The sketch keeps the island's own proportions and letterboxes inside the
   frame. Projecting it into the frame's ratio instead stretched Aruba into
   a sliver — and moved the pin with it. */
const SKETCH_W = 340;
const SKETCH_H = 200;

export default function RideDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [ride, setRide] = useState<AssignedJob | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * Claiming and opening are one gesture, and the read can beat the write
   * home: the pool navigates here the instant claim_ride() returns, and
   * the row it selects is only visible once driver_id is actually set.
   * Losing that race used to render "This job isn't yours" over a job
   * that was. Three attempts, then the honest answer.
   */
  const load = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await loadRide(id);
      if (r) { setRide(r); return; }
      await new Promise((done) => setTimeout(done, 500));
    }
    setRide("missing");
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const move = useCallback(
    async (to: RideStatus, leaveAfter: boolean) => {
      setBusy(true);
      setProblem(null);
      const res = await setRideStatus(id, to);
      setBusy(false);
      if (!res.ok) { setProblem(res.detail); return; }
      if (leaveAfter) navigate("/drive");
      else void load();
    },
    [id, load, navigate],
  );

  if (ride === null) {
    return (
      <div className="drv-view">
        <RideBar onBack={() => navigate("/drive")} />
        <div className="drv-empty" style={{ paddingTop: 60 }}><p className="et">Loading the job.</p></div>
      </div>
    );
  }

  if (ride === "missing") {
    return (
      <div className="drv-view">
        <RideBar onBack={() => navigate("/drive")} />
        <div className="drv-gate">
          <div className="gi mark">?</div>
          <h1>This job isn't yours.</h1>
          <p>It may have been reassigned, or the link is out of date.</p>
          <button type="button" className="drv-cta ghost" onClick={() => navigate("/drive")}>Back to the schedule</button>
        </div>
      </div>
    );
  }

  const step = FLOW.find((s) => s.from === ride.status);
  const undo = UNDO[ride.status];
  const stageIndex = STAGES.findIndex((s) => s.status === ride.status);
  const pin: Coord | null =
    ride.pickupLat != null && ride.pickupLng != null
      ? { lat: ride.pickupLat, lon: ride.pickupLng }
      : null;
  const mapsHref = pin
    ? `https://maps.google.com/?daddr=${pin.lat},${pin.lon}`
    : `https://maps.google.com/?daddr=${encodeURIComponent(ride.pickup)}`;
  const initial = (ride.contactName || "?").trim().charAt(0).toUpperCase();
  const phone = ride.contactPhone ? normalizePhone(ride.contactPhone) : null;
  const away = relativeWhen(ride.scheduledAt);

  const party = [
    ride.passengers != null ? `${ride.passengers} guest${ride.passengers === 1 ? "" : "s"}` : null,
    ride.luggage ? `${ride.luggage} bags` : null,
    ride.childSeats ? `${ride.childSeats} child seat${ride.childSeats > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="drv-view">
      <RideBar onBack={() => navigate("/drive")} away={away} />

      <div className="drv-dhead">
        <div className="dk">{jobDate(ride.scheduledAt)} · {jobTime(ride.scheduledAt)}</div>
        <h1>{shortPlace(ride.pickup)} →<br />{shortPlace(ride.dropoff)}</h1>
        <div className="ref">
          {[ride.bookingRef, ride.vehicle].filter(Boolean).join(" · ") || "—"}
        </div>
      </div>

      {/* Where the job stands, not just what to press next. */}
      <ol className="drv-rail" aria-label="Ride progress">
        {STAGES.map((s, i) => (
          <li
            key={s.status}
            className={i < stageIndex ? "done" : i === stageIndex ? "now" : ""}
            aria-current={i === stageIndex ? "step" : undefined}
          >
            <span className="rd" aria-hidden="true" />
            <span className="rt">{s.label}</span>
          </li>
        ))}
      </ol>

      {/* The note beats the pin, so it comes first. */}
      {ride.pickupNote && (
        <div className="drv-pad" style={{ paddingTop: 16, paddingBottom: 0 }}>
          <div className="drv-note" style={{ margin: "0 0 16px" }}>
            <div className="nk">Guest note</div>
            <div className="nv">“{ride.pickupNote}”</div>
          </div>
        </div>
      )}

      <PinMap at={pin} />

      <div className="drv-pad" style={{ paddingTop: 16, paddingBottom: 24 }}>
        <div className="drv-pax">
          <span className="av">{initial}</span>
          <span className="pi">
            <span className="pn">{ride.contactName || "Guest"}</span>
            <span className="pm">{party || "—"}</span>
          </span>
          {phone && (
            <span className="pc">
              <a href={`tel:${phone}`} aria-label={`Call ${ride.contactName || "guest"}`}>
                <Phone /><b>Call</b>
              </a>
              <a
                href={`https://wa.me/${phone.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Message ${ride.contactName || "guest"}`}
              >
                <Chat /><b>Chat</b>
              </a>
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
          {/* The driver's money leads. The guest's total is shown under it
              rather than hidden — a driver who can see both trusts the
              first number, and this is the one screen with room for it. */}
          <div className="drv-r">
            <span className="rl">You earn</span>
            <span className="rv hl">{ride.payoutUsd != null ? `$${Math.round(ride.payoutUsd)}` : "—"}</span>
          </div>
          <div className="drv-r">
            <span className="rl">Guest pays</span>
            <span className="rv">
              {ride.fareAwg != null ? `$${Math.round(awgToUsd(ride.fareAwg))}` : "—"}
              <small className="rsub"> · less {Math.round(COMMISSION_RATE * 100)}% Cabby's</small>
            </span>
          </div>
        </div>

        <a className="drv-cta ghost" href={mapsHref} target="_blank" rel="noreferrer">Open in Maps ↗</a>
      </div>

      <div className="drv-actionbar">
        <div className="inner">
          {/* A refused step, in the database's own words, where the thumb
              already is — not in a console nobody is holding. */}
          {problem && (
            <div className="drv-refused" role="alert" style={{ margin: "0 0 12px" }}>
              <div className="rk">That didn't go through</div>
              <p>{problem}</p>
            </div>
          )}
          {step ? (
            <button type="button" className={`drv-cta ${step.tone}`} onClick={() => void move(step.next, step.next === "completed")} disabled={busy}>
              {busy ? "…" : step.label}
            </button>
          ) : (
            <button type="button" className="drv-cta ghost" onClick={() => navigate("/drive")}>
              {ride.status === "completed" ? "Completed ✓" : "Back to the schedule"}
            </button>
          )}
          {undo && (
            <button type="button" className="drv-undo" onClick={() => void move(undo.to, false)} disabled={busy}>
              {undo.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The way out. This route renders bare — no top bar, no tabs — so without
 * this there is no way back to the roster short of finishing the job.
 */
function RideBar({ onBack, away }: { onBack: () => void; away?: string }) {
  return (
    <div className="drv-dbar">
      <button type="button" onClick={onBack} aria-label="Back to the schedule">
        <span aria-hidden="true">‹</span> Schedule
      </button>
      <span className="dbr">{away}</span>
    </div>
  );
}

/**
 * The pickup, at door level.
 *
 * Sized in CSS pixels, so it has to know how wide it drew before it can
 * ask for an image — the same measure-then-fetch the passenger route map
 * does, for the same reason: rendering at a guessed width and again at the
 * real one buys two static maps for every job opened.
 *
 * Every failure ends at the sketch: no key, a rejected key, a dead network
 * or a ride with no pin on it yet.
 */
function PinMap({ at }: { at: Coord | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (w: number) => setWidth((prev) => (w > 0 && w !== prev ? Math.ceil(w / 32) * 32 : prev));
    measure(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const url =
    at && !failed && width > 0 && googleMapsEnabled
      ? pinMapUrl(at, { width, height: MAP_HEIGHT, retina: true })
      : null;
  const p = at ? project(at, SKETCH_W, SKETCH_H) : null;

  return (
    <div className="drv-pinmap" ref={box} style={{ height: MAP_HEIGHT }}>
      {url ? (
        <img
          src={url}
          alt="Map of the pickup pin"
          width={width}
          height={MAP_HEIGHT}
          onError={() => { reportGoogleMapsFailure("driver pin map"); setFailed(true); }}
        />
      ) : (
        <svg viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path d={islandPath(SKETCH_W, SKETCH_H)} fill="var(--raised)" stroke="var(--silver-deep)" strokeWidth="1.2" opacity=".55" />
          {p && (
            <g transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}>
              <circle r="16" fill="var(--signal)" opacity=".22" />
              <path d="M0,-17 C9,-17 13.5,-10 13.5,-3.5 C13.5,4.5 0,13.5 0,13.5 C0,13.5 -13.5,4.5 -13.5,-3.5 C-13.5,-10 -9,-17 0,-17 Z" fill="var(--signal)" />
              <circle cx="0" cy="-3.5" r="4.5" fill="var(--deep)" />
            </g>
          )}
        </svg>
      )}
      <span className={`drv-pinbadge${at ? "" : " wait"}`}>
        {at ? "Guest pinned" : "No pin yet"}
      </span>
      {at && !url && <span className="drv-pinnote">Sketch — not to scale</span>}
      {url && <span className="drv-pinnote">© Google</span>}
    </div>
  );
}

/* Two glyphs the old screen borrowed from the typeface — "✆" and "✉" —
   which render as anything from a dingbat to a blank box depending on the
   phone. Drawn, so they are the same on every one. */
function Phone() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function Chat() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12Z" strokeLinejoin="round" />
    </svg>
  );
}
