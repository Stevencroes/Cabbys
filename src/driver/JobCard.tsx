// A job as a driver reads it from a mount: when, where from, where to,
// what it pays. Each leg carries a second line — the area, or the flight
// when the airport is involved — because "Eagle Beach" is 2km of sand and
// the qualifier is what makes it a place.
import { formatTime, formatDate, ARUBA_OFFSET_MINUTES } from "../lib/datetime";
import { findPlaceByName, AIRPORT } from "../data/places";
import { formatFlightNumber } from "../lib/flight";
import type { OpenJob, AssignedJob } from "./lib/driver";

export type ChipTone = "" | "next" | "live" | "aboard" | "alert" | "done";

/** Colour carries the state, so it reads without stopping to think. */
export function statusChip(status: string): { tone: ChipTone; label: string } {
  switch (status) {
    case "driver_assigned": return { tone: "", label: "Assigned" };
    case "en_route":        return { tone: "live", label: "On my way" };
    case "arrived":         return { tone: "next", label: "Waiting" };
    case "in_progress":     return { tone: "aboard", label: "Aboard" };
    case "completed":       return { tone: "done", label: "Done" };
    case "cancelled":       return { tone: "alert", label: "Cancelled" };
    default:                return { tone: "", label: "Open" };
  }
}

/** The stored instant, read on Aruba's clock (UTC−4, no DST). */
function arubaParts(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + ARUBA_OFFSET_MINUTES * 60_000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

export function jobTime(iso: string | null): string {
  const p = arubaParts(iso);
  return p ? formatTime(p.time) : "—";
}

export function jobDate(iso: string | null): string {
  const p = arubaParts(iso);
  return p ? formatDate(p.date) : "";
}

/** "Tue 11 Aug" — the year is noise on a card for next week. */
export function jobDateShort(iso: string | null): string {
  const full = jobDate(iso);
  return full ? full.split(" ").slice(0, 3).join(" ") : "";
}

/**
 * The header summary form: the airport is "Airport", everywhere else is
 * its area. "Bucuti & Tara Beach Resort" becomes "Eagle Beach" — the
 * exact property is still spelled out in the rows below.
 */
export function shortPlace(name: string): string {
  if (name === AIRPORT.name) return "Airport";
  const place = findPlaceByName(name);
  return place ? place.area : name;
}

/** Minutes from now until pickup; negative once it's passed. */
export function minutesUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : Math.round((t - now) / 60_000);
}

/** The second line under a place: the flight if it's the airport, else the area. */
function legSub(name: string, opts: { arriving?: boolean; flight?: string | null }): string {
  const isAirport = name === AIRPORT.name;
  if (isAirport) {
    const flight = opts.flight ? formatFlightNumber(opts.flight) : null;
    const hall = opts.arriving ? "Arrivals" : "Departure";
    return flight ? `${hall} · ${flight}` : hall;
  }
  const place = findPlaceByName(name);
  return place ? place.area : "";
}

interface JobCardProps {
  job: OpenJob | AssignedJob;
  chip?: { tone: ChipTone; label: string };
  /** replaces the fare in the foot — used by the claimable pool */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  onOpen?: () => void;
  /** shows the day instead of the clock in the top-right */
  showDay?: boolean;
  /**
   * Replaces the clock in the top-right. The pool leads with the fare
   * there — you're choosing on price — while Today leads with the time,
   * because you're executing on it.
   */
  headline?: string;
  /** the card is leaving because someone else took it */
  leaving?: boolean;
}

export default function JobCard({ job, chip, action, onOpen, showDay, headline, leaving }: JobCardProps) {
  const c = chip ?? statusChip(job.status);
  const flight = "flightNumber" in job ? job.flightNumber : null;
  const meta = [
    job.vehicle,
    job.passengers != null ? `${job.passengers} pax` : null,
    job.luggage ? `${job.luggage} bags` : null,
  ].filter(Boolean).join(" · ");

  const fromSub = legSub(job.pickup, { arriving: true, flight });
  const toSub = legSub(job.dropoff, { arriving: false, flight });

  const body = (
    <>
      <div className="drv-jtop">
        <span className={`drv-chip ${c.tone}`}>{c.label}</span>
        <span className="drv-jtime">
          {headline ?? (showDay ? jobDateShort(job.scheduledAt) : jobTime(job.scheduledAt))}
        </span>
      </div>

      <div className="drv-leg">
        <span className="ic a" aria-hidden="true" />
        <div>
          <div className="lp">{job.pickup || "—"}</div>
          {fromSub && <div className="ls">{fromSub}</div>}
        </div>
      </div>
      <div className="drv-leg">
        <span className="ic b" aria-hidden="true" />
        <div>
          <div className="lp">{job.dropoff || "—"}</div>
          {toSub && <div className="ls">{toSub}</div>}
        </div>
      </div>

      <div className="drv-jfoot">
        <span className="meta">{meta || "—"}</span>
        {action ? (
          <button
            type="button"
            className="drv-claim"
            onClick={(e) => { e.stopPropagation(); action.onClick(); }}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        ) : (
          <span className="fare">{job.fare != null ? `$${Math.round(job.fare)}` : "—"}</span>
        )}
      </div>
    </>
  );

  const cls = `drv-job${leaving ? " going" : ""}`;

  // Only a card that goes somewhere is a button; a claimable one isn't,
  // because its own Accept button would then be nested inside it.
  return onOpen ? (
    <button type="button" className={cls} onClick={onOpen}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
