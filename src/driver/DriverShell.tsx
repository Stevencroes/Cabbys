// The shell: the mark and the online switch never move, because whether
// you are taking work is the one thing that must be true at a glance from
// a car mount. Everything else scrolls beneath.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { isImminent, setOnline, type DriverProfile, type OpenJob } from "./lib/driver";
import { jobDateShort, jobTime } from "./JobCard";
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

export default function DriverShell({ driver, children, bare }: ShellProps) {
  const navigate = useNavigate();
  const [online, setOnlineState] = useState(driver.isOnline);
  const [booked, setBooked] = useState<OpenJob | null>(null);
  /** the last on/off tap didn't reach the database */
  const [offFailed, setOffFailed] = useState(false);
  const offers = useRideOffers(online);

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

  return (
    <div className="drv">
      {!bare && (
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
      )}

      {offFailed && !bare && (
        <div className="drv-offline" role="alert">
          <span>Couldn't reach Cabby's — you're still {online ? "online" : "offline"}. Check your signal and try again.</span>
          <button type="button" onClick={() => setOffFailed(false)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="drv-screen">{children}</div>

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

      {!bare && (
        <nav className="drv-nav" aria-label="Driver">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "on" : "")}>
              <span className="dot" aria-hidden="true" />
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
