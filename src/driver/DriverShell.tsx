// The shell: the mark and the online switch never move, because whether
// you are taking work is the one thing that must be true at a glance from
// a car mount. Everything else scrolls beneath.
import { useCallback, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { isImminent, setOnline, type DriverProfile, type OpenJob } from "./lib/driver";
import { jobDateShort, jobTime } from "./JobCard";
import RideOffer from "./RideOffer";
import { useRideOffers } from "./useRideOffers";
import { primeAudio } from "./lib/chime";
import "../styles/driver.css";

/** Which agenda segment a newly claimed job will appear under. */
function spanFor(job: OpenJob): string {
  const mins = job.scheduledAt ? (new Date(job.scheduledAt).getTime() - Date.now()) / 60_000 : 0;
  if (mins < 60 * 24) return "today";
  if (mins < 60 * 48) return "tomorrow";
  return "later";
}

const TABS = [
  { to: "/drive", label: "Today", end: true },
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
  const offers = useRideOffers(online);

  const toggle = useCallback(() => {
    const next = !online;
    setOnlineState(next);   // optimistic — the switch must feel instant
    // the one deliberate tap before work can arrive: use it to unlock
    // audio, so the first offer is allowed to chime
    if (next) primeAudio();
    void setOnline(next);
  }, [online]);

  /**
   * Where a claim lands. A job starting in twenty minutes should open the
   * live screen; one on Friday should go into the diary with a word that
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
      navigate("/drive?span=" + spanFor(claimed));
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
              onClick={toggle}
              role="switch"
              aria-checked={online}
              aria-label={online ? "Go offline" : "Go online"}
            />
          </div>
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
              {jobTime(offers.missed.scheduledAt)} · {offers.missed.fare != null ? `$${Math.round(offers.missed.fare)}` : "—"}
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
