// The shell: the mark and the online switch never move, because whether
// you are taking work is the one thing that must be true at a glance from
// a car mount. Everything else scrolls beneath.
//
// One piece of markup, three layouts (see THE FRAME in driver.css). On a
// phone the header is a bar pinned to the top and the nav a thumb rail
// pinned to the foot. Past the desk breakpoint the same header becomes a
// rail down the left — mark, switch, the five places, who is signed in —
// the pattern AdminShell already uses, so the two portals hold their
// navigation in the same place. It used to be the phone layout on every
// screen: a 560px column centred in a 1440px window, with the five tabs
// spread across the full width of the bottom edge, 280px apart.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  isImminent, loadAssigned, loadDriverDocuments, missingIdentity, setOnline,
  type AssignedJob, type DriverProfile, type OpenJob,
} from "./lib/driver";
import { outstandingDocuments } from "./lib/documents";
import { jobDateShort, jobTime, shortPlace, statusChip } from "./JobCard";
import RideOffer from "./RideOffer";
import { useRideOffers } from "./useRideOffers";
import { primeAudio } from "./lib/chime";
import { arubaDayOf, todayInAruba } from "../lib/datetime";
import "../styles/driver.css";

/**
 * The day of the roster a newly claimed job lands on.
 *
 * This used to answer "today", "tomorrow" or "later", which was the shape
 * of the old three-segment agenda. The roster is a real calendar now, so
 * the answer is a real date — including for a job three weeks out, which
 * "later" could only shrug at.
 */
function dayOf(job: OpenJob): string {
  return arubaDayOf(job.scheduledAt) || todayInAruba();
}

const TABS = [
  { to: "/drive", label: "Schedule", end: true },
  { to: "/drive/pool", label: "Pool", end: false },
  { to: "/drive/earnings", label: "Earnings", end: false },
  { to: "/drive/history", label: "History", end: false },
  { to: "/drive/profile", label: "Profile", end: false },
];

interface ShellProps {
  driver: DriverProfile;
  children: ReactNode;
  /** the ride detail owns the whole screen — no nav, no top bar */
  bare?: boolean;
}

/** The statuses that mean a job is happening right now, not later. */
const RUNNING = new Set(["en_route", "arrived", "in_progress"]);

/** "your name and your plate", not "your name, your plate". */
function listGaps(gaps: string[]): string {
  if (gaps.length <= 1) return gaps[0] ?? "";
  return `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}`;
}

export default function DriverShell({ driver, children, bare }: ShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [online, setOnlineState] = useState(driver.isOnline);
  const [booked, setBooked] = useState<OpenJob | null>(null);
  /** the last on/off tap didn't reach the database */
  const [offFailed, setOffFailed] = useState(false);
  /** the job the driver is in the middle of, if there is one */
  const [live, setLive] = useState<AssignedJob | null>(null);
  const offers = useRideOffers(online);
  const gaps = missingIdentity(driver);
  /**
   * What Cabby's is still waiting on from them, by name.
   *
   * The SAME band as the identity one below, not a second one: one
   * component, one place, one shape, and a precedence rule rather than
   * two things competing for the foot of the screen. Identity wins,
   * because a missing plate is a guest at a kerb this morning while a
   * missing permit is a conversation with an operator.
   *
   * Read once on mount, not polled. Nobody's paperwork changes while
   * they are looking at the Earnings screen, and this is a phone on
   * island mobile data — the 45-second poll below exists because a ride
   * in flight genuinely can change under them, and that reasoning does
   * not carry to a licence. A failed read leaves the list empty on
   * purpose: a band that nags about documents because it could not
   * count them is worse than no band.
   */
  const [docGaps, setDocGaps] = useState<string[]>([]);

  useEffect(() => {
    let stop = false;
    void loadDriverDocuments(driver.id).then(({ documents, error }) => {
      if (stop || error) return;
      setDocGaps(outstandingDocuments(documents));
    });
    return () => { stop = true; };
  }, [driver.id]);

  /**
   * A job in flight outranks whatever screen is open.
   *
   * A driver who checked their earnings mid-ride, or whose phone reloaded
   * the page at a red light, had no way back to the job except finding it
   * in the roster — on the one screen where losing thirty seconds matters
   * most. The bar is the way back, and it is also the answer to "is the
   * ride actually running?", which was previously only visible from
   * inside the ride.
   */
  useEffect(() => {
    let stop = false;
    async function check() {
      const { jobs } = await loadAssigned(driver.id);
      if (stop) return;
      setLive(jobs.find((j) => RUNNING.has(j.status)) ?? null);
    }
    void check();
    // cheap, and only while a driver is looking: the bar has to survive a
    // reload, which means reading it back rather than holding it in state
    const t = setInterval(() => void check(), 45_000);
    return () => { stop = true; clearInterval(t); };
  }, [driver.id, pathname]);

  // A claim confirmed is a word, not a state to dismiss. It clears itself
  // so a driver who put the phone down doesn't come back to a bar sitting
  // over the nav.
  useEffect(() => {
    if (!booked) return;
    const t = setTimeout(() => setBooked(null), 6000);
    return () => clearTimeout(t);
  }, [booked]);

  /**
   * The switch stays optimistic — one that waits for a round trip in a
   * car park with one bar feels broken — but it no longer lies. If the
   * write doesn't land, the switch goes back to where it was and says so:
   * a portal reading "Online" over a row that says otherwise is a driver
   * sitting out a whole shift wondering where the work went.
   */
  const toggle = useCallback(async () => {
    const next = !online;
    setOnlineState(next);
    setOffFailed(false);
    // the one deliberate tap before work can arrive: use it to unlock
    // audio, so the first offer is allowed to chime
    if (next) primeAudio();
    const ok = await setOnline(next);
    if (!ok) {
      setOnlineState(!next);
      setOffFailed(true);
    }
  }, [online]);

  /**
   * Where a claim lands. A job starting in twenty minutes should open the
   * live screen; one on Friday should go into the roster with a word that
   * it's booked. Dropping a driver onto "I'm on my way" for a ride three
   * days out is just wrong.
   */
  async function acceptOffer(job?: OpenJob) {
    const claimed = await offers.accept(job);
    if (!claimed) return;
    if (isImminent(claimed)) {
      navigate(`/drive/ride/${claimed.id}`);
    } else {
      setBooked(claimed);
      navigate(`/drive?day=${dayOf(claimed)}&view=day`);
    }
  }

  // A band riding over the foot of the screen needs room reserved under
  // the last thing on the page, or it sits on top of it: on a phone the
  // "can't spot you" band covered the last card on every screen and there
  // was no scrolling it clear. The class reserves that room (driver.css).
  const nocar = !live && !bare && gaps.length > 0;
  const nodocs = !live && !bare && gaps.length === 0 && docGaps.length > 0;
  const banded = nocar || nodocs || (live !== null && !bare) || booked !== null
    || (!offers.offer && offers.missed !== null);

  return (
    <div className={["drv", bare ? "bare" : "", banded ? "banded" : ""].filter(Boolean).join(" ")}>
      {/* The rail comes first in the document, so on a desk a keyboard
          has six stops before the screen it came for. */}
      <a className="drv-skip" href="#drv-main">Skip to the screen</a>
      <div className="drv-frame">
        {/* Rendered on the ride screen too, and hidden there below the
            desk breakpoint: on a phone the ride owns the whole screen, on
            a desk the rail costs it nothing and is the way to the rest. */}
        <header className="drv-side">
          <div className="drv-top">
            <span className="drv-mark">
              Cabby<span className="ap">'</span>s
              <small>Driver</small>
            </span>
            <div className="drv-onoff">
              <span className={`st${online ? " on" : ""}`}>{online ? "Online" : "Offline"}</span>
              <button
                type="button"
                className={`drv-tgl${online ? " on" : ""}`}
                onClick={() => void toggle()}
                role="switch"
                aria-checked={online}
                aria-label={online ? "Go offline" : "Go online"}
              />
            </div>
          </div>

          <nav className="drv-nav" aria-label="Driver">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "on" : "")}>
                <span className="dot" aria-hidden="true" />
                {t.label}
              </NavLink>
            ))}
          </nav>

          {/* Who is signed in, on the desk rail only — the same line the
              admin rail keeps, for the same reason: one identity system,
              and "why is this empty" is sometimes "the other account". */}
          <div className="drv-sidefoot">
            {driver.fullName && <span className="nm">{driver.fullName}</span>}
            {driver.email && <span className="em" title={driver.email}>{driver.email}</span>}
          </div>
        </header>

        <main className="drv-screen" id="drv-main" tabIndex={-1}>
          {offFailed && !bare && (
            <div className="drv-offline" role="alert">
              <span>Couldn't reach Cabby's — you're still {online ? "online" : "offline"}. Check your signal and try again.</span>
              <button type="button" onClick={() => setOffFailed(false)} aria-label="Dismiss">✕</button>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* An unfilled car is the fault the whole stamp chain was built to
          fix, reproduced one driver at a time: claim_ride writes what the
          drivers row holds, and if it holds nothing the guest is back to
          watching an empty kerb. Said here rather than left to be
          discovered by somebody standing outside arrivals — and it yields
          to a job in flight, which is always the more urgent thing. */}
      {nocar && (
        <button type="button" className="drv-nocar" onClick={() => navigate("/drive/profile")}>
          <span className="ck">Your guests can't spot you</span>
          <span className="cv">
            Your bookings are missing {listGaps(gaps)}, so there's nothing for a
            guest to look for. Add {gaps.length === 1 ? "it" : "them"} — it takes a minute.
          </span>
        </button>
      )}

      {/* The same band, the other gap. Approval came before these were
          ever asked for, so the drivers already on the road have none of
          them on file — and a licence or a permit that has been sent
          back is the kind of thing that stops being a paperwork problem
          the morning somebody is pulled over. Named pieces, not a count,
          for the same reason the band above names them. */}
      {nodocs && (
        <button type="button" className="drv-nocar docs" onClick={() => navigate("/drive/profile")}>
          <span className="ck">Cabby's is still waiting on your paperwork</span>
          <span className="cv">
            We don't have {listGaps(docGaps)}. Send {docGaps.length === 1 ? "it" : "them"} from
            your profile — PDF, straight from your phone.
          </span>
        </button>
      )}

      {/* A job in flight, from anywhere in the portal. Not shown on the
          ride screen itself, which IS the job. */}
      {live && !bare && (
        <button type="button" className="drv-live" onClick={() => navigate(`/drive/ride/${live.id}`)}>
          <span className="lp" aria-hidden="true" />
          <span className="li">
            <span className="lk">{statusChip(live.status).label}</span>
            <span className="lv">{shortPlace(live.pickup)} → {shortPlace(live.dropoff)}</span>
          </span>
          <span className="lg">Open</span>
        </button>
      )}

      {/* the job is yours, but it isn't now — say so and leave them in the diary */}
      {booked && (
        <div className="drv-booked" role="status">
          <div>
            <span className="bk">Booked in</span>
            <span className="bv">
              {jobDateShort(booked.scheduledAt)} · {jobTime(booked.scheduledAt)}
            </span>
          </div>
          <button type="button" onClick={() => setBooked(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* a lapsed offer stays reachable for a minute and a half */}
      {!offers.offer && offers.missed && (
        <div className="drv-grace" role="status">
          <div className="gi">
            <span className="gk">Still open</span>
            <span className="gv">
              {jobTime(offers.missed.scheduledAt)} · {offers.missed.payoutUsd != null ? `$${Math.round(offers.missed.payoutUsd)}` : "—"}
            </span>
          </div>
          <button
            type="button"
            className="drv-claim"
            disabled={offers.busy}
            onClick={() => void acceptOffer(offers.missed ?? undefined)}
          >
            {offers.busy ? "…" : "Accept"}
          </button>
          <button type="button" className="gx" onClick={offers.clearMissed} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* an offer outranks whatever screen is underneath it */}
      {offers.offer && (
        <RideOffer
          job={offers.offer}
          busy={offers.busy}
          refused={offers.refused}
          onAccept={() => void acceptOffer()}
          onDismiss={offers.dismiss}
        />
      )}
    </div>
  );
}
