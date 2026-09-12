// A finished ride, as one line of a receipt.
//
// The same row on two screens: History reads it chronologically, Earnings
// reads it as the work behind a figure. It is one component because it is
// one fact — and because a driver who taps it on one screen will try to
// tap it on the other.
//
// Tapping opens the ride. That follows from what Earnings already argues
// for itself: a total a driver cannot take apart is a number they have to
// take on faith. Opening the day was the first half of that; opening the
// ride is the rest of it — the route, the party, the guest's fare and the
// commission that came off it, all of which live on the ride screen.
import { shortAirport } from "./JobCard";
import type { AssignedJob } from "./lib/driver";

interface RideRowProps {
  job: AssignedJob;
  /** the badge at the head of the row — an initial, or an hour */
  mark: string;
  /** the line under the route: when it was driven, and in what */
  meta: string;
  onOpen?: () => void;
}

export default function RideRow({ job, mark, meta, onOpen }: RideRowProps) {
  const body = (
    <>
      <span className="drv-hav" aria-hidden="true">{mark}</span>
      <span className="drv-hmain">
        <span className="hr">{shortAirport(job.pickup)} → {shortAirport(job.dropoff)}</span>
        <span className="hm">{meta}</span>
      </span>
      <span className="drv-hf">{job.payoutUsd != null ? `$${Math.round(job.payoutUsd)}` : "—"}</span>
    </>
  );

  return onOpen ? (
    <button type="button" className="drv-hrow tap" onClick={onOpen}>{body}</button>
  ) : (
    <div className="drv-hrow">{body}</div>
  );
}
