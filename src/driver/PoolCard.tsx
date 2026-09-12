// A claimable job, laid out for choosing rather than for executing.
//
// The roster's card (JobCard) is read by someone who has already agreed
// to the work: it can be terse, because the decision is behind them. A
// pool card is read by someone deciding, in a car, in daylight, against
// four other cards — and the old one asked them to make that decision out
// of 8.5px uppercase labels and 10px grey sublines. Everything here is a
// step up the type scale and a step up the contrast ladder, and each fact
// gets its own line instead of being joined into one grey run-on.
//
// Three bands, in the order the decision is actually made:
//   when → where → what it pays.
//
// The money band is the reason this file exists twice over. A driver must
// never be shown the guest's fare as though it were theirs, so the big
// figure is the PAYOUT, it is labelled "You earn", and the guest's total
// sits under it in small type with the commission named. Both numbers
// visible, neither able to be mistaken for the other.
import { JobLegs, jobDateShort, jobFacts, jobTime, relativeWhen } from "./JobCard";
import { awgToUsd, COMMISSION_RATE } from "../lib/quote";
import { meetingPointFor } from "../data/meetingPoints";
import type { OpenJob } from "./lib/driver";

interface PoolCardProps {
  job: OpenJob;
  onAccept: () => void;
  busy?: boolean;
  /** another driver got there first — the card leaves rather than blinks */
  leaving?: boolean;
  disabled?: boolean;
}

export default function PoolCard({ job, onAccept, busy, leaving, disabled }: PoolCardProps) {
  const soon = (job.scheduledAt ? relativeWhen(job.scheduledAt) : "") || "Unscheduled";
  const guestUsd = job.fareAwg != null ? Math.round(awgToUsd(job.fareAwg)) : null;

  return (
    <article className={`drv-pool${leaving ? " going" : ""}`}>
      <div className="pc-when">
        <span className="pw-day">{jobDateShort(job.scheduledAt) || "No date"}</span>
        <span className="pw-time">{jobTime(job.scheduledAt)}</span>
        <span className="pw-rel">{soon}</span>
      </div>

      <div className="pc-body">
        <JobLegs job={job} meet={meetingPointFor(job.pickup)?.at} />
        <ul className="pc-facts">
          {jobFacts(job).map((f) => <li key={f}>{f}</li>)}
        </ul>
      </div>

      <div className="pc-money">
        <div className="pm-fig">
          <span className="pm-k">You earn</span>
          <span className="pm-v">{job.payoutUsd != null ? `$${Math.round(job.payoutUsd)}` : "—"}</span>
          {/* Said plainly, every time: the big number is not the fare. */}
          <span className="pm-s">
            {guestUsd != null
              ? `Guest pays $${guestUsd} · less ${Math.round(COMMISSION_RATE * 100)}% Cabby's`
              : `After ${Math.round(COMMISSION_RATE * 100)}% Cabby's`}
          </span>
        </div>
        <button
          type="button"
          className="drv-cta green pc-accept"
          onClick={onAccept}
          disabled={disabled || busy}
        >
          {busy ? "Claiming…" : "Accept"}
        </button>
      </div>
    </article>
  );
}
