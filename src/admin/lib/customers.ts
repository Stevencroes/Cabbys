// Guests, assembled out of their bookings — because there is nowhere
// else for them to come from.
//
// THERE IS NO CUSTOMERS TABLE IN THIS PROJECT, and this file does not
// invent one. A guest is auth.users plus three text columns on the ride
// they booked: contact_name, contact_email, contact_phone. Everything
// below is those columns, grouped. That has two consequences worth
// saying out loud rather than discovering:
//
//  · A guest who has never booked does not exist here. There is no
//    sign-up list to read — the marketing site's accounts are the same
//    auth.users the drivers and the operator sign in with, and an admin
//    in a browser cannot enumerate them. Only bookings are readable.
//  · Everything is as good as what was typed into the last booking
//    form. A guest who typed their name three different ways is three
//    ways of one name, and the grouping below picks the account over
//    the spelling wherever it can.
//
// The grouping key, in order of how much it can be trusted:
//
//   1. passenger_id — the auth account, including the ANONYMOUS one
//      created for a guest checkout (see auth.signInAnonymously in the
//      booking flow). Stable across bookings from the same browser and
//      never typed, so it is the only key here that cannot be a typo.
//   2. the email address, lowercased. Typed, but typed by somebody who
//      wants the confirmation to arrive.
//   3. the phone number, digits only. Same reasoning, one rung down —
//      "+297 560 7336" and "2975607336" are one person.
//   4. the name. Last, and only so that a booking with nothing else on
//      it still lands somewhere rather than vanishing.
//
// What this file deliberately does NOT do is anything a CRM would. No
// segments, no lifetime value score, no tags. This is a transfer
// service: the operator's question about a guest is "what did they book
// and what is coming", and both are rides.
import { isClosed, type AdminRide } from "./admin";
import { awgToUsd } from "../../lib/quote";

export interface Customer {
  /** the grouping key — see the ladder above. Used as the route
      parameter, so it has to survive a URL. */
  key: string;
  /** how they were identified, so the screen can say when a row is two
      bookings held together by a phone number rather than an account */
  keyKind: "account" | "email" | "phone" | "name";
  name: string | null;
  email: string | null;
  phone: string | null;
  /** every booking of theirs the board can see, newest first */
  rides: AdminRide[];
  /** the soonest ride still ahead of them, if any */
  next: AdminRide | null;
  /** the most recent one that actually happened */
  last: AdminRide | null;
  /** bookings made, cancellations included — the honest count, because
      a guest who booked five times and cancelled four is not a guest
      who rode five times, and "total rides" would say they were */
  bookings: number;
  completed: number;
  cancelled: number;
  /** what they have paid Cabby's across completed rides, in USD */
  spendUsd: number;
}

const digits = (v: string | null): string => (v ?? "").replace(/\D+/g, "");

/** The key this booking files under, and how much it can be trusted. */
export function customerKey(r: AdminRide): { key: string; kind: Customer["keyKind"] } | null {
  if (r.passengerId) return { key: `a:${r.passengerId}`, kind: "account" };
  const email = (r.guestEmail ?? "").trim().toLowerCase();
  if (email) return { key: `e:${email}`, kind: "email" };
  const phone = digits(r.guestPhone);
  if (phone) return { key: `p:${phone}`, kind: "phone" };
  const name = (r.guestName ?? "").trim().toLowerCase();
  if (name) return { key: `n:${name}`, kind: "name" };
  // A booking with no name, no number, no address and no account is not
  // a customer — it is a broken row, and it belongs on the ride board
  // where it can be fixed, not in a directory of people.
  return null;
}

/**
 * Everyone who has booked, most recently active first.
 *
 * `rides` is whatever the board has read — upcoming and history
 * together. The function does not fetch: two screens need these people
 * derived from two different windows of time, and a loader hidden in
 * here would have made that impossible to see.
 */
export function customersFrom(rides: AdminRide[], now: number = Date.now()): Customer[] {
  const by = new Map<string, Customer>();

  for (const r of rides) {
    const id = customerKey(r);
    if (!id) continue;
    let c = by.get(id.key);
    if (!c) {
      c = {
        key: id.key, keyKind: id.kind,
        name: null, email: null, phone: null,
        rides: [], next: null, last: null,
        bookings: 0, completed: 0, cancelled: 0, spendUsd: 0,
      };
      by.set(id.key, c);
    }
    c.rides.push(r);
  }

  for (const c of by.values()) {
    // Newest booking first, and the newest booking is also where the
    // contact details come from: a guest who changed their number told
    // us in their most recent form, not their first.
    c.rides.sort((a, b) =>
      String(b.scheduledAt ?? b.createdAt ?? "").localeCompare(String(a.scheduledAt ?? a.createdAt ?? "")));
    c.name = c.rides.find((r) => r.guestName)?.guestName ?? null;
    c.email = c.rides.find((r) => r.guestEmail)?.guestEmail ?? null;
    c.phone = c.rides.find((r) => r.guestPhone)?.guestPhone ?? null;

    c.bookings = c.rides.length;
    c.completed = c.rides.filter((r) => r.status === "completed").length;
    c.cancelled = c.rides.filter((r) => r.status === "cancelled").length;
    c.spendUsd = c.rides
      .filter((r) => r.status === "completed" && r.fareAwg != null)
      .reduce((sum, r) => sum + awgToUsd(r.fareAwg as number), 0);

    const ahead = c.rides
      .filter((r) => !isClosed(r) && r.scheduledAt && new Date(r.scheduledAt).getTime() >= now)
      .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    c.next = ahead[0] ?? null;
    c.last = c.rides.find((r) => r.status === "completed") ?? null;
  }

  return [...by.values()].sort((a, b) => {
    // Somebody with a ride coming is the row an operator is looking
    // for; everyone else sorts by when they last travelled.
    const an = a.next?.scheduledAt;
    const bn = b.next?.scheduledAt;
    if (an && bn) return an.localeCompare(bn);
    if (an) return -1;
    if (bn) return 1;
    return String(b.last?.scheduledAt ?? "").localeCompare(String(a.last?.scheduledAt ?? ""));
  });
}

/** One guest out of a list already derived. Kept here so the detail
    screen and the directory cannot disagree about who is who. */
export function customerByKey(list: Customer[], key: string): Customer | null {
  return list.find((c) => c.key === key) ?? null;
}

/** Type-to-filter across the three things anybody searches a guest by.
    Not the ride id — that is the requests board's search, and matching
    both here would make one box mean two things. */
export function matchesCustomer(c: Customer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [c.name, c.email, c.phone].some((v) => (v ?? "").toLowerCase().includes(q));
}
