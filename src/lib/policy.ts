// Cancellation policy — one rule, stated everywhere the same way:
// free cancellation until FREE_CANCEL_HOURS before pickup.

export const FREE_CANCEL_HOURS = 24;

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
