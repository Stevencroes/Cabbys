// A job, as a driver reads it at a glance: when, where from, where to,
// what it pays. The two legs are a filled pin and a hollow ring joined by
// a rule — the shape says "journey" before any word is read.
import { formatTime, formatDate } from "../lib/datetime";
import type { OpenJob } from "./lib/driver";

export type ChipTone = "" | "go" | "aboard" | "alert" | "wait";

/** Colour carries the state, so it reads without stopping to think. */
export function statusChip(status: string): { tone: ChipTone; label: string } {
  switch (status) {
    case "en_route":       return { tone: "go", label: "On my way" };
    case "arrived":        return { tone: "wait", label: "Waiting" };
    case "in_progress":    return { tone: "aboard", label: "Aboard" };
    case "driver_assigned":return { tone: "go", label: "Assigned" };
    case "completed":      return { tone: "", label: "Done" };
    case "cancelled":      return { tone: "alert", label: "Cancelled" };
    default:               return { tone: "", label: "Open" };
  }
}

function timeOf(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // stored as an instant; Aruba is UTC−4 year-round
  const aruba = new Date(d.getTime() - 4 * 3_600_000);
  const hh = String(aruba.getUTCHours()).padStart(2, "0");
  const mm = String(aruba.getUTCMinutes()).padStart(2, "0");
  return formatTime(`${hh}:${mm}`);
}

function dayOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const aruba = new Date(d.getTime() - 4 * 3_600_000);
  return formatDate(aruba.toISOString().slice(0, 10));
}

interface JobCardProps {
  job: OpenJob;
  /** shown top-right; falls back to the job's own status */
  chip?: { tone: ChipTone; label: string };
  action?: { label: string; onClick: () => void; tone?: "go" | "primary" };
  onOpen?: () => void;
  highlight?: boolean;
  showDay?: boolean;
}

export default function JobCard({ job, chip, action, onOpen, highlight, showDay }: JobCardProps) {
  const c = chip ?? statusChip(job.status);
  const meta = [
    job.vehicle,
    job.passengers != null ? `${job.passengers} pax` : null,
    job.luggage != null ? `${job.luggage} bags` : null,
    job.childSeats ? `${job.childSeats} seat${job.childSeats > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  const body = (
    <>
      <div className="drv-jhead">
        <div>
          <span className="drv-jtime num">{timeOf(job.scheduledAt)}</span>
          {showDay && <span className="lbl tight" style={{ display: "block", marginTop: 4 }}>{dayOf(job.scheduledAt)}</span>}
        </div>
        <span className={`drv-chip ${c.tone}`}>{c.label}</span>
      </div>

      <div className="drv-legs">
        <div className="rail" aria-hidden="true">
          <span className="pin" />
          <span className="line" />
          <span className="ring" />
        </div>
        <div>
          <div className="leg">
            <span className="k">Pick up</span>
            <span className="v num">{job.pickup || "—"}</span>
          </div>
          <div className="leg">
            <span className="k">Drop off</span>
            <span className="v num">{job.dropoff || "—"}</span>
          </div>
        </div>
      </div>

      <div className="drv-jfoot">
        <span className="drv-jmeta">{meta || "—"}</span>
        <span className="drv-jfare num">{job.fare != null ? `$${Math.round(job.fare)}` : "—"}</span>
      </div>
    </>
  );

  return (
    <div className={`drv-job${highlight ? " next" : ""}`}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          style={{ all: "unset", display: "block", width: "100%", cursor: "pointer" }}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {action && (
        <button
          type="button"
          className={`drv-btn ${action.tone === "go" ? "go" : ""}`}
          style={{ marginTop: 14 }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
