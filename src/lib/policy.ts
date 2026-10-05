// Cancellation and waiting policy — each rule one number, stated
// everywhere the same way. The FAQ, the How it works route and My trips
// read these; the legal pages (src/content/legal) are approval-gated and
// are not generated from them.

/**
 * Free cancellation up to this many hours before pickup — the headline.
 *
 * Inside it, cancelling is STILL free while payment is cash to the driver:
 * the owner set no late fee, and there is nothing to take one from. What
 * changes inside the window is only the ask — cancel as soon as you know,
 * so a driver is not sent for nothing. "A fee may apply" stood in the FAQ
 * and the My trips cancel panel while the fee was undecided; it is decided
 * now, as none, and that line is gone. If card payment is switched on and
 * the owner sets a late fee, this is where it goes, and every sentence
 * that reads cancellationInfo() follows.
 */
export const FREE_CANCEL_HOURS = 24;

/**
 * How long a driver waits, free, after the flight ACTUALLY lands.
 *
 * The owner's numbers. The FAQ once promised sixty minutes and "three
 * hours late and your driver is still there", both before anyone had
 * decided; 1d173f2 took them out. These are decided: the driver goes by
 * the real landing time, not the booked one, so a late flight never eats
 * into this, and there are no waiting charges after it either — once it
 * runs out the driver calls and WhatsApps, and with still no contact may
 * leave, and the ride counts as a no-show.
 */
export const AIRPORT_FREE_WAIT_MINUTES = 60;

/** The same, at a hotel or any other address, from the pickup time. */
export const ADDRESS_FREE_WAIT_MINUTES = 15;

// How long after a booking lands a person replies on WhatsApp. Set by the
// owner at one hour: fifteen minutes was a placeholder nobody had agreed to,
// and it went out in writing in every guest's confirmation email, including
// bookings made at 3am Aruba time. Everything that promises a window reads
// this one number, the email included (api/booking-alerts.ts keeps a copy
// that a test holds equal).
export const CONFIRM_WINDOW_MINUTES = 60;

/** "1 hour", "2 hours", "45 minutes" — the window as a person says it. */
export function confirmWindowLabel(minutes: number = CONFIRM_WINDOW_MINUTES): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${minutes} minutes`;
}

export interface CancellationInfo {
  /** Cancelling now is free of charge. True up to pickup while there is
      no late fee — see FREE_CANCEL_HOURS. */
  free: boolean;
  /** Inside the FREE_CANCEL_HOURS window, before pickup: still free, but
      a driver may already be lined up, so the guest is asked to cancel
      as soon as they know. */
  late: boolean;
  /** Whole hours until pickup (negative when pickup has passed). */
  hoursUntil: number;
  /** Ready-to-render sentence for the current situation. */
  label: string;
}

export function scheduledDate(date: string, time: string): Date | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || "12:00"}:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function cancellationInfo(pickup: Date | null, now: Date = new Date()): CancellationInfo {
  if (!pickup) {
    return { free: true, late: false, hoursUntil: Infinity, label: "Free cancellation." };
  }
  const hoursUntil = Math.floor((pickup.getTime() - now.getTime()) / 3_600_000);
  const passed = hoursUntil < 0;
  const late = !passed && hoursUntil < FREE_CANCEL_HOURS;
  // This said "cancellation may carry a fee" inside the window. There is
  // no fee — see FREE_CANCEL_HOURS — so the label says free and makes the
  // ask instead.
  const label = passed
    ? "Pickup time has passed."
    : late
    ? `Inside ${FREE_CANCEL_HOURS} hours of pickup — still free. Please cancel as soon as you know, so a driver isn't sent for nothing.`
    : `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup.`;
  return { free: !passed, late, hoursUntil, label };
}
