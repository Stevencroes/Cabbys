// The incoming-ride offer.
//
// A card at the bottom of a list is not an offer — a driver in a mount
// will never see it. When a new unclaimed ride appears while they're
// online, it takes the whole screen, chimes once, and counts down. Twenty
// seconds is long enough to read a route and decide, short enough that a
// pinned phone doesn't hold a job hostage.
//
// Letting it lapse is not a refusal: the ride stays in the pool for
// whoever wants it, and this driver simply isn't asked about it again.
import { useEffect, useRef, useState } from "react";
import { jobTime } from "./JobCard";
import { chime } from "./lib/chime";
import type { OpenJob } from "./lib/driver";

/** Seconds an offer stands before it lapses back to the pool. */
export const OFFER_SECONDS = 20;

interface RideOfferProps {
  job: OpenJob;
  onAccept: () => void;
  onDismiss: () => void;
  busy?: boolean;
  /** the reason a claim just failed, shown in place of the countdown */
  refused?: string | null;
}

export default function RideOffer({ job, onAccept, onDismiss, busy, refused }: RideOfferProps) {
  const [left, setLeft] = useState(OFFER_SECONDS);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  // one chime per offer, on the way in
  useEffect(() => { void chime(); }, [job.id]);

  useEffect(() => {
    setLeft(OFFER_SECONDS);
    const started = Date.now();
    const t = setInterval(() => {
      const remaining = OFFER_SECONDS - Math.floor((Date.now() - started) / 1000);
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(t);
        dismiss.current();
      }
    }, 250);
    return () => clearInterval(t);
  }, [job.id]);

  // Escape declines, same as the button
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const pct = Math.max(0, Math.min(1, left / OFFER_SECONDS));
  const R = 26;
  const C = 2 * Math.PI * R;

  const meta = [
    job.vehicle,
    job.passengers != null ? `${job.passengers} pax` : null,
    job.luggage ? `${job.luggage} bags` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="drv-offer" role="dialog" aria-modal="true" aria-label="New ride offer">
      <div className="drv-offer-in">
        <div className="oh">
          <span className="ok">New ride</span>
          {refused ? (
            <span className="drv-chip alert">Refused</span>
          ) : (
            <span className="ring" aria-label={`${Math.max(left, 0)} seconds left`}>
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r={R} className="track" />
                <circle
                  cx="32" cy="32" r={R} className="run"
                  style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }}
                />
              </svg>
              <b>{Math.max(left, 0)}</b>
            </span>
          )}
        </div>

        <div className="ofare">{job.fare != null ? `$${Math.round(job.fare)}` : "—"}</div>
        <div className="owhen">{jobTime(job.scheduledAt)}</div>

        <div className="olegs">
          <div className="drv-leg">
            <span className="ic a" aria-hidden="true" />
            <div><div className="lp">{job.pickup || "—"}</div></div>
          </div>
          <div className="drv-leg">
            <span className="ic b" aria-hidden="true" />
            <div><div className="lp">{job.dropoff || "—"}</div></div>
          </div>
        </div>

        <div className="ometa">{meta || "—"}</div>

        {refused && <p className="orefused" role="alert">{refused}</p>}

        <div className="oacts">
          <button type="button" className="drv-cta green" onClick={onAccept} disabled={busy}>
            {busy ? "…" : "Accept"}
          </button>
          <button type="button" className="drv-cta ghost" onClick={onDismiss} disabled={busy}>
            {refused ? "Close" : "Not this one"}
          </button>
        </div>
      </div>
    </div>
  );
}
