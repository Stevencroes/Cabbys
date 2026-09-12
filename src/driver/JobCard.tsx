// A job as a driver reads it from a mount: when, where from, where to,
// what it pays. Each leg carries a second line — the area, or the flight
// when the airport is involved — because "Eagle Beach" is 2km of sand and
// the qualifier is what makes it a place.
//
// The pieces below the card are exported because the pool builds its own
// card out of them (see PoolCard.tsx): same legs, same party, same words
// for the same facts, laid out for choosing rather than for executing.
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

/**
 * How far off a pickup is, said the way a driver would say it: minutes
 * while it is close enough to drive to, hours for the rest of today, days
 * after that. "In 4,320 minutes" is not an answer anyone uses.
 */
export function relativeWhen(iso: string | null, now = Date.now()): string {
  const mins = minutesUntil(iso, now);
  if (mins === null) return "";
  if (mins < 0) {
    const late = -mins;
    return late < 60 ? `${late} min ago` : `${Math.round(late / 60)}h ago`;
  }
  if (mins < 60) return `in ${mins} min`;
  if (mins < 60 * 20) return `in ${Math.round(mins / 60)}h`;
  const days = Math.round(mins / 60 / 24);
  return days <= 1 ? "tomorrow" : `in ${days} days`;
}

/** The party, as separate facts rather than one run-on string. */
export function jobFacts(job: OpenJob | AssignedJob): string[] {
  return [
    job.vehicle,
    job.passengers != null ? `${job.passengers} guest${job.passengers === 1 ? "" : "s"}` : null,
    job.luggage ? `${job.luggage} bag${job.luggage === 1 ? "" : "s"}` : null,
    job.childSeats ? `${job.childSeats} child seat${job.childSeats === 1 ? "" : "s"}` : null,
  ].filter((v): v is string => Boolean(v));
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

/** Pickup over dropoff, each with the line that makes it a real place. */
export function JobLegs({ job }: { job: OpenJob | AssignedJob }) {
  const flight = "flightNumber" in job ? job.flightNumber : null;
  const fromSub = legSub(job.pickup, { arriving: true, flight });
  const toSub = legSub(job.dropoff, { arriving: false, flight });
  return (
    <>
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
    </>
  );
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
   * there — you're choosing on price — while the roster leads with the
   * time, because you're executing on it. `null` drops it entirely, for
   * the day view, where the clock already stands in the rail beside the
   * card and printing it twice just competes with itself.
   */
  headline?: string | null;
  /** the card is leaving because someone else took it */
  leaving?: boolean;
}

export default function JobCard({ job, chip, action, onOpen, showDay, headline, leaving }: JobCardProps) {
  const c = chip ?? statusChip(job.status);
  const top =
    headline === null
      ? null
      : headline ?? (showDay ? jobDateShort(job.scheduledAt) : jobTime(job.scheduledAt));

  const body = (
    <>
      <div className="drv-jtop">
        <span className={`drv-chip ${c.tone}`}>{c.label}</span>
        {top && <span className="drv-jtime">{top}</span>}
      </div>

      <JobLegs job={job} />

      <div className="drv-jfoot">
        <span className="meta">{jobFacts(job).join(" · ") || "—"}</span>
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
          <span className="fare">{job.payoutUsd != null ? `$${Math.round(job.payoutUsd)}` : "—"}</span>
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
