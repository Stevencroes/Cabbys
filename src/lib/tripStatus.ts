// ── One trip, one status ─────────────────────────────────────────────────
//
// Everything My Trips says about a ride is decided here, once, and every
// part of the screen — the badge, the tab it files under, the actions it
// offers, whether the driver's phone is shown — reads the answer rather
// than working its own out.
//
// That is the fix, not a tidy-up. The page used to decide status in one
// place and filing in another: status came from the row, the shelf came
// from the clock. They disagreed exactly when it mattered — a ride whose
// pickup had gone by but that nobody closed kept its "Driver assigned"
// badge and was filed under Past, so the screen said a driver was on the
// way to a trip that was over. With one function deciding both, the tab
// cannot say one thing while the badge says another.
//
// Authority is the BACKEND row plus timestamps, never where a card
// happens to be displayed. The row's status says what the operation last
// recorded; the pickup time says whether that record can still be true.
// "Driver assigned" at 9am for a 2pm pickup is a fact. The same word at
// 9pm is a trip nobody closed, and it is shown as one.
//
// What this does NOT invent: nothing in the backend writes "no_show" or
// "refunded" today. Both are recognised if a future writer uses them —
// an authoritative word should never be thrown away — but neither is
// ever inferred. A trip that ended ambiguously is "needs review", which
// is the one honest thing to say about it.
import { VEHICLES } from "../data/vehicles";
import { pickupInstant } from "./pickupPin";

export type TripStatus =
  | "received"
  | "confirmed"
  | "driver_assigned"
  | "en_route"
  | "arrived"
  | "onboard"
  | "completed"
  | "cancelled"
  | "no_show"
  | "needs_review";

/** Where a trip files. "review" is not a tab — it is shown above them. */
export type Placement = "upcoming" | "past" | "cancelled" | "review";

export const STATUS_LABEL: Record<TripStatus, string> = {
  received: "Booking received",
  confirmed: "Confirmed",
  driver_assigned: "Driver assigned",
  en_route: "Driver en route",
  arrived: "Driver arrived",
  onboard: "Passenger onboard",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  needs_review: "Trip needs review",
};

/** The journey, in order, for the progress line on a live trip. */
export const JOURNEY: TripStatus[] = [
  "received", "confirmed", "driver_assigned", "en_route", "arrived", "onboard", "completed",
];

/** The subset of the row this module reads. */
export interface TripRow {
  status?: string | null;
  scheduled_at?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  vehicle_class?: string | null;
  vehicle_type?: string | null;
  payment_status?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
}

/**
 * How long after the pickup time an unclosed trip is still believable.
 *
 * Six hours, and deliberately generous, because the pickup time on a
 * booking does not move when a flight does. The FAQ promises that a guest
 * who lands three hours late still has a driver waiting; a trip that is
 * three hours past its booked time and still "Driver assigned" may be
 * exactly that promise being kept. Past six hours, no delay explains it:
 * the trip happened or it did not, and either way nobody recorded which.
 */
export const CLOSE_GRACE_HOURS = 6;

/**
 * How far ahead of pickup an assigned trip counts as ACTIVE — the window
 * in which "contact your driver" is a reasonable thing to offer. Before
 * it the driver is off duty or on another job, and a guest messaging
 * them about a trip on Thursday is a message to Cabby's routed to the
 * wrong person.
 */
export const ACTIVE_LEAD_HOURS = 2;

/**
 * The raw statuses the database lets a guest cancel from.
 *
 * Mirrors public.cancel_my_ride in docs/cancel-schema.sql EXACTLY, and
 * must change with it. Offering "Cancel" on a status outside this list is
 * offering a control the database will refuse.
 */
export const CANCELLABLE_RAW = ["pending", "pending_payment", "confirmed", "driver_assigned"] as const;

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** The row's word, read. Null when the word is one we do not know. */
function fromBackend(raw: string): TripStatus | null {
  switch (raw) {
    case "pending":
    case "pending_payment":
    case "requested":
      return "received";
    case "confirmed":
    case "accepted":
    case "paid":
      return "confirmed";
    case "driver_assigned":
    case "assigned":
      return "driver_assigned";
    case "en_route":
      return "en_route";
    case "arrived":
      return "arrived";
    case "in_progress":
    case "on_board":
    case "onboard":
      return "onboard";
    case "completed":
      return "completed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "no_show":
    case "noshow":
      return "no_show";
    default:
      return null;
  }
}

const TERMINAL: ReadonlySet<TripStatus> = new Set(["completed", "cancelled", "no_show"]);

export interface TripState {
  status: TripStatus;
  placement: Placement;
  /** why a trip needs review, in words a guest can read */
  reviewReason: string | null;
  /** a driver is on it now or within the next ACTIVE_LEAD_HOURS */
  active: boolean;
  /** pickup instant, ISO, or null when the row carries no time */
  pickupAt: string | null;
}

/** The one status for this ride, now. */
export function tripState(row: TripRow, now: number = Date.now()): TripState {
  const raw = norm(row.status);
  const pickupAt = pickupInstant(row);
  const pickupMs = pickupAt ? Date.parse(pickupAt) : NaN;
  const known = fromBackend(raw);

  if (known === null) {
    // A status word this screen has never seen. Guessing would put a
    // label on it that nobody wrote; saying so gets it looked at.
    return {
      status: "needs_review",
      placement: "review",
      reviewReason: "We can't read this trip's status. Let us know and we'll check it.",
      active: false,
      pickupAt,
    };
  }

  if (TERMINAL.has(known)) {
    return {
      status: known,
      placement: known === "cancelled" ? "cancelled" : "past",
      reviewReason: null,
      active: false,
      pickupAt,
    };
  }

  // Not closed. Whether that can still be true depends on the clock.
  if (!Number.isNaN(pickupMs) && now > pickupMs + CLOSE_GRACE_HOURS * 3_600_000) {
    return {
      status: "needs_review",
      placement: "review",
      reviewReason:
        "The pickup time has passed and this trip was never marked complete or cancelled. " +
        "If something went wrong, tell us. If the ride went fine, there's nothing you need to do.",
      active: false,
      pickupAt,
    };
  }

  const moving = known === "en_route" || known === "arrived" || known === "onboard";
  const soon =
    known === "driver_assigned" &&
    !Number.isNaN(pickupMs) &&
    now >= pickupMs - ACTIVE_LEAD_HOURS * 3_600_000;

  return { status: known, placement: "upcoming", reviewReason: null, active: moving || soon, pickupAt };
}

/** Cancel is offered only where the database will accept it. */
export function canCancel(row: TripRow, state: TripState, now: number = Date.now()): boolean {
  if (state.placement !== "upcoming") return false;
  if (!(CANCELLABLE_RAW as readonly string[]).includes(norm(row.status))) return false;
  // After the pickup time, a cancellation is a conversation, not a button.
  const at = state.pickupAt ? Date.parse(state.pickupAt) : NaN;
  return Number.isNaN(at) || at > now;
}

/** The driver's details belong on the card while a driver is on the trip. */
export function showsDriver(row: TripRow, state: TripState): boolean {
  return (
    !!row.driver_name &&
    (state.status === "driver_assigned" ||
      state.status === "en_route" ||
      state.status === "arrived" ||
      state.status === "onboard")
  );
}

/**
 * Whether the driver's phone may be shown.
 *
 * Only while the trip is active. A driver's personal number handed out a
 * week ahead is a number that gets messaged about luggage at midnight,
 * and it stays on the guest's phone long after the ride.
 */
export function canContactDriver(row: TripRow, state: TripState): boolean {
  return state.active && !!row.driver_phone && showsDriver(row, state);
}

// ── payment ────────────────────────────────────────────────────────────

export type PaymentState = "paid" | "pending" | "failed" | "refunded" | "with_driver" | "unknown";

/**
 * payment_status, read.
 *
 * api/stripe-webhook.ts writes three words: authorized, paid, failed.
 * Empty is not "unpaid" — it is the normal case while card payment is
 * switched off, when the fare is settled with the driver at a fixed
 * price. Calling that "Payment pending" would tell every guest they owe
 * money they were told they would pay on the day.
 *
 * "refunded" is recognised so a future writer can use it; nothing writes
 * it today, because this project has no refund path.
 */
export function paymentState(row: TripRow): PaymentState {
  const p = norm(row.payment_status);
  if (!p) return "with_driver";
  if (p === "paid") return "paid";
  if (p === "authorized" || p === "authorised") return "pending";
  if (p === "failed") return "failed";
  if (p === "refunded") return "refunded";
  return "unknown";
}

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  paid: "Paid",
  pending: "Payment pending",
  failed: "Payment failed",
  refunded: "Refunded",
  with_driver: "Pay your driver",
  unknown: "Payment status unavailable",
};

/** The sentence under the label: what that state means for the guest. */
export const PAYMENT_DETAIL: Record<PaymentState, string> = {
  paid: "Charged to your card.",
  pending: "Held on your card, not charged yet.",
  failed: "Your card didn't go through. Contact us to sort it out.",
  refunded: "Returned to your card.",
  with_driver: "Fixed price, settled with your driver on the day.",
  unknown: "Contact us and we'll confirm it.",
};

/** What the total is called, so a number never stands on its own. */
export const TOTAL_LABEL: Record<PaymentState, string> = {
  paid: "Total paid",
  pending: "Total",
  failed: "Total due",
  refunded: "Total refunded",
  with_driver: "Total",
  unknown: "Total",
};

// ── display helpers ────────────────────────────────────────────────────

/**
 * The vehicle, by its name.
 *
 * The row stores the catalog id in both vehicle_class and vehicle_type,
 * and the card used to print both — "TRANSIT · TRANSIT". The name lives
 * in the catalog; an id the catalog no longer has is shown as itself
 * rather than hidden, because a guest checking which car is coming
 * would rather read "limo" than nothing.
 */
export function vehicleName(row: TripRow): string | null {
  const id = norm(row.vehicle_class) || norm(row.vehicle_type);
  if (!id) return null;
  return VEHICLES.find((v) => v.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Dollars, labelled as dollars. Rounded like every other price on the site. */
export function formatUsd(n: number): string {
  return `US$${Math.round(n)}`;
}
