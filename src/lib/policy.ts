// Cancellation policy — one rule, stated everywhere the same way:
// free cancellation until FREE_CANCEL_HOURS before pickup.

export const FREE_CANCEL_HOURS = 24;

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
  /** Cancelling now is free of charge. */
  free: boolean;
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
    return { free: true, hoursUntil: Infinity, label: "Free cancellation." };
  }
  const hoursUntil = Math.floor((pickup.getTime() - now.getTime()) / 3_600_000);
  const free = hoursUntil >= FREE_CANCEL_HOURS;
  const label = free
    ? `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup.`
    : hoursUntil >= 0
    ? `Inside the ${FREE_CANCEL_HOURS}-hour window — cancellation may carry a fee.`
    : "Pickup time has passed.";
  return { free, hoursUntil, label };
}
