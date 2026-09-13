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
//    Maps key there is now a real map, and without one the fallback is the
//    same island sketch the passenger site draws, from the real coastline,
//    labelled as a sketch.
//
// About that map, and the thing it is honest about now: rides.pickup_lat,
// pickup_lng and pickup_note are columns docs/driver-schema.sql creates
// and NOTHING IN THIS APP EVER WRITES. The guest-drops-a-pin flow the
// header above describes was specified and never built — buildRidePayload
// sets none of the three, and no other writer exists. So every ride
// reached this screen with no pin, and the map had nothing to centre on
// but an island.
//
// Until that flow exists, the pickup's own NAME is the best location we
// hold, and it is a good one: the catalog knows where its places are, and
// resolvePin sharpens a hotel from its area centre to its actual door.
// The map is drawn from that, and the badge says which of the two it is
// looking at — "Guest pinned" only ever means a real dropped pin. An
// approximate map of the right resort beats an accurate map of nowhere.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jobDate, jobTime, relativeWhen, shortPlace } from "../JobCard";
import {
  canRelease, loadRide, releaseRide, setRideStatus,
  type AssignedJob, type RideStatus,
} from "../lib/driver";
import { awgToUsd, COMMISSION_RATE } from "../../lib/quote";
import { coordOf, islandPath, pinMapUrl, project, type Coord } from "../../lib/route";
import { buildLine, googleMapsEnabled, lastMapFailure, onMapFailure, reportGoogleMapsFailure } from "../../lib/googleMaps";
import { mapDebugOn } from "../../lib/mapDebug";
import { findPlaceByName, selFromPlace } from "../../data/places";
import { resolvePin } from "../../lib/placePins";
import { formatFlightNumber } from "../../lib/flight";
import { meetingPointFor } from "../../data/meetingPoints";
import { whatsappLink } from "../../lib/whatsapp";
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

/**
 * What the booking was told, as separate facts.
 *
 * Step3Details joins these with " · " into one column, which is a fine way
 * to store them and a terrible way to read them from a car mount: the
 * child seats' AGES, the flight's landing time and the typed address
 * behind a custom pickup all arrive in the middle of one grey sentence.
 * Splitting it back out is the whole treatment — same words, one per line.
 *
 * A guest's own free text can of course contain a middot, in which case
 * it becomes two lines. That is the entire downside, and it is smaller
 * than the paragraph.
 */
function noteLines(notes: string | null): string[] {
  return (notes ?? "").split(" · ").map((part) => part.trim()).filter(Boolean);
}

/**
 * Where the pickup is, and how sure we are.
 *
 * "exact" is a coordinate the guest themselves dropped. "approximate" is
 * the catalog's answer for the place they named — the resort's own point
 * once resolvePin has sharpened it, the area centre until then. The
 * distinction is the badge, and it is not cosmetic: a driver who trusts
 * an approximate point as a door will stand in the wrong car park.
 */
type Fix = { at: Coord; exact: boolean } | null;

function fixFor(ride: AssignedJob, aboard: boolean): Fix {
  // A guest only ever pins where they are standing, so an exact point
  // belongs to the pickup and never to the drop-off.
  if (!aboard && ride.pickupLat != null && ride.pickupLng != null) {
    return { at: { lat: ride.pickupLat, lon: ride.pickupLng }, exact: true };
  }
  const place = findPlaceByName(aboard ? ride.dropoff : ride.pickup);
  if (!place) return null;
  const at = coordOf(selFromPlace(place));
  return at ? { at, exact: false } : null;
}
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
  /** completing is the one step with nothing behind it — it asks first */
  const [confirming, setConfirming] = useState(false);
  /** handing the job back: null when closed, else the reason being typed */
  const [handback, setHandback] = useState<string | null>(null);

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

  const giveBack = useCallback(
    async (reason: string) => {
      setBusy(true);
      setProblem(null);
      const res = await releaseRide(id, reason);
      setBusy(false);
      if (!res.ok) { setProblem(res.detail); return; }
      navigate("/drive/pool");
    },
    [id, navigate],
  );

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

  /**
   * Which end of the journey this screen is about.
   *
   * Until the guest is in the car, everything here is about finding them:
   * the map, the meeting point, the note, the Navigate button. The moment
   * they are aboard, all of that is history and the only place that
   * matters is where they are going. The screen used to keep leading with
   * the pickup for the whole ride, so a driver with a guest in the back
   * was reading directions to where they had just been.
   */
  const aboard = ride.status === "in_progress" || ride.status === "completed";
  const target = aboard ? ride.dropoff : ride.pickup;
  // The map follows the leg too. Blanking it once the guest was aboard
  // left a driver mid-ride looking at an empty island.
  const fix = fixFor(ride, aboard);
  const meet = meetingPointFor(target);

  // The deep link prefers a coordinate the GUEST dropped, and otherwise
  // the NAME: Google resolves "Bucuti & Tara Beach Resort" to its door,
  // where an area centre would send the driver to the middle of Eagle
  // Beach. An approximate point is good enough to draw and not good
  // enough to navigate by.
  const navHref = fix?.exact
    ? `https://maps.google.com/?daddr=${fix.at.lat},${fix.at.lon}`
    : `https://maps.google.com/?daddr=${encodeURIComponent(target)}`;
  const initial = (ride.contactName || "?").trim().charAt(0).toUpperCase();
  const phone = ride.contactPhone ? normalizePhone(ride.contactPhone) : null;
  const away = relativeWhen(ride.scheduledAt);
  const help = whatsappLink(
    `Hello Cabby's — I need a hand with booking ${ride.bookingRef ?? ride.id}.`,
  );

  /**
   * Three sentences a driver sends more than any other, pre-written.
   *
   * Not a messaging platform — WhatsApp already is one, the guest is
   * already on it, and this is a deep link with the text filled in. What
   * it saves is the typing, which is the whole reason a driver phones
   * instead and interrupts somebody in a shower.
   */
  const quick = phone
    ? [
        ["I'm outside", `Hello${ride.contactName ? ` ${ride.contactName.split(" ")[0]}` : ""}, this is your Cabby's driver — I'm outside at ${meet?.at ?? ride.pickup}.`],
        ["On my way", `Hello${ride.contactName ? ` ${ride.contactName.split(" ")[0]}` : ""}, this is your Cabby's driver — on my way to you now.`],
        ["Where are you?", `Hello${ride.contactName ? ` ${ride.contactName.split(" ")[0]}` : ""}, this is your Cabby's driver — I'm at the pickup. Whereabouts are you?`],
      ].map(([label, text]) => [label, `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`])
    : [];

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

      <PinMap fix={fix} place={target} />

      <div className="drv-pad" style={{ paddingTop: 16, paddingBottom: 24 }}>
        {/* The one thing the driver is trying to do right now, with the
            last hundred metres spelled out and one button that goes
            there. An address gets you to the property; "main lobby
            entrance" is what stops you circling it. */}
        <div className="drv-where">
          <div className="wk">{aboard ? "Destination" : "Pick up"}</div>
          <div className="wn">{target || "—"}</div>
          {meet && <div className="wp">{meet.at}</div>}
          {meet?.how && <div className="wh">{meet.how}</div>}
          <a className="drv-cta green drv-navcta" href={navHref} target="_blank" rel="noreferrer">
            Navigate ↗
          </a>
        </div>

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

        {/* Said at booking, and until now shown to nobody. It sits under
            the guest rather than above the map because it is context, not
            the landmark that closes the last 20 metres — that is the amber
            card, and it stays up there alone. */}
        {noteLines(ride.bookingNotes).length > 0 && (
          <div className="drv-told">
            <div className="tk">What the guest told us</div>
            <ul>
              {noteLines(ride.bookingNotes).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}

        {/* Three sentences, pre-written, for the moment a driver would
            otherwise ring a guest who is in the shower. */}
        {quick.length > 0 && !aboard && (
          <div className="drv-quick">
            {quick.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer">{label}</a>
            ))}
          </div>
        )}

        <div className="drv-rowset">
          {/* It said "tracked", and nothing tracks it — there is no flight
              feed in this app. The number is what the guest gave us, and
              saying only that is the difference between a driver checking
              the board themselves and one who thinks we will tell them. */}
          {ride.flightNumber && (
            <div className="drv-r">
              <span className="rl">Flight</span>
              <span className="rv">{formatFlightNumber(ride.flightNumber)}</span>
            </div>
          )}
          <div className="drv-r"><span className="rl">Pick up</span><span className="rv">{ride.pickup}</span></div>
          <div className="drv-r"><span className="rl">Drop off</span><span className="rv">{ride.dropoff}</span></div>
          {ride.arrivedAt && (
            <div className="drv-r">
              <span className="rl">You arrived</span>
              <span className="rv">{jobTime(ride.arrivedAt)}</span>
            </div>
          )}
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

        {/* Claiming was one-way until now: a driver whose car won't start
            held a job nobody else could see. Offered only where the
            database will actually allow it, so the portal never shows a
            control that is going to be refused. */}
        {canRelease(ride) && (
          handback === null ? (
            <button type="button" className="drv-handback" onClick={() => setHandback("")}>
              Can't do this job?
            </button>
          ) : (
            <div className="drv-give">
              <div className="gk">Hand this job back</div>
              <p>
                It returns to the pool for another driver. Tell us why, so dispatch isn't
                guessing.
              </p>
              <label className="sr-only" htmlFor="giveback">Why you can't do it</label>
              <input
                id="giveback"
                type="text"
                value={handback}
                autoFocus
                placeholder="Car won't start"
                onChange={(e) => setHandback(e.target.value)}
              />
              <div className="row">
                <button type="button" className="drv-cta ghost" onClick={() => setHandback(null)} disabled={busy}>
                  Keep it
                </button>
                <button
                  type="button"
                  className="drv-cta red"
                  onClick={() => void giveBack(handback)}
                  disabled={busy || handback.trim().length < 3}
                >
                  {busy ? "…" : "Hand it back"}
                </button>
              </div>
            </div>
          )
        )}

        {/* Always reachable, and never mistakable for the ride's own
            action: Cabby's is who you call when the job itself goes
            wrong, and that is not a thing to go hunting for on Profile. */}
        {help && (
          <a className="drv-help" href={help} target="_blank" rel="noreferrer">Something wrong? Message Cabby's ↗</a>
        )}
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
          {/* Every other step has an undo. This one ends the job, closes
              the money and drops the driver back to the roster, so it is
              the only one that asks. Two taps, not five. */}
          {confirming && step?.next === "completed" ? (
            <div className="drv-confirm" role="group" aria-label="Confirm the ride is finished">
              <p>Complete this ride? The guest is dropped off and the job closes.</p>
              <div className="row">
                <button type="button" className="drv-cta ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  Not yet
                </button>
                <button type="button" className="drv-cta red" onClick={() => void move("completed", true)} disabled={busy}>
                  {busy ? "…" : "Complete"}
                </button>
              </div>
            </div>
          ) : step ? (
            <button
              type="button"
              className={`drv-cta ${step.tone}`}
              onClick={() => (step.next === "completed" ? setConfirming(true) : void move(step.next, false))}
              disabled={busy}
            >
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
 * The pickup, on a map.
 *
 * Sized in CSS pixels, so it has to know how wide it drew before it can
 * ask for an image — the same measure-then-fetch the passenger route map
 * does, for the same reason: rendering at a guessed width and again at the
 * real one buys two static maps for every job opened.
 *
 * Every failure ends at the sketch: no key, a rejected key, a dead network
 * or a pickup this app has never heard of. Which of those it was is the
 * kind of question that costs an afternoon from the outside, so
 * ?mapdebug=1 puts the answer in the caption — the same flag, and the same
 * channel, the passenger route map already answers on.
 */
function PinMap({ fix, place }: { fix: Fix; place: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const debug = mapDebugOn();
  const [why, setWhy] = useState(() => (debug ? lastMapFailure() : ""));

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (raw: number) => {
      if (raw <= 0) return;
      const bucketed = Math.ceil(raw / 32) * 32;
      setWidth((prev) => (bucketed === prev ? prev : bucketed));
    };
    measure(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!debug) return;
    setWhy(lastMapFailure());
    return onMapFailure(setWhy);
  }, [debug]);

  // Sharpen a named pickup from its area centre to the building itself.
  // Fails soft in every direction: no key, no match, or an answer too far
  // from the area to be about this place all leave the centre standing.
  useEffect(() => {
    if (!fix || fix.exact) return;
    const p = findPlaceByName(place);
    if (p) void resolvePin(selFromPlace(p));
  }, [fix, place]);

  const url =
    fix && !failed && width > 0
      ? pinMapUrl(fix.at, { width, height: MAP_HEIGHT, retina: true, zoom: fix.exact ? 17 : 15 })
      : null;
  const p = fix ? project(fix.at, SKETCH_W, SKETCH_H) : null;

  /** Why this is a drawing, said in the words of whoever has to fix it. */
  const reason = !fix
    ? `no coordinates for "${place}" — and no guest pin on this ride`
    : !googleMapsEnabled
    ? lastMapFailure()
    : width <= 0
    ? "the map frame measured 0px wide"
    : failed
    ? why || "the static image did not load"
    : "";

  return (
    <div className="drv-pinmap" ref={box} style={{ height: MAP_HEIGHT }}>
      {url ? (
        <img
          src={url}
          alt={`Map of the pickup at ${place}`}
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

      {/* Where this point came from, said plainly. A driver who reads an
          area centre as a door stands in the wrong car park, so only a
          coordinate somebody actually dropped gets called a pin. */}
      <span className={`drv-pinbadge${fix?.exact ? "" : " wait"}`}>
        {fix?.exact ? "Guest pinned" : fix ? "Approximate — from the address" : "No location"}
      </span>

      {debug ? (
        <span className="drv-pinnote dbg">{[reason || "map drawn", buildLine()].join(" · ")}</span>
      ) : url ? (
        <span className="drv-pinnote">© Google</span>
      ) : fix ? (
        <span className="drv-pinnote">Sketch — not to scale</span>
      ) : null}
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
