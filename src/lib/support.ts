// ── What is already in the box when a guest opens a chat with us ──────
//
// whatsappLink() owns the URL. This owns the MESSAGE, and it exists
// because six screens were each writing their own: six chances for the
// voice to drift, and — the part that actually costs something — six
// chances for a message to arrive without saying which booking it is
// about. A reply that has to begin "which booking is this?" has already
// spent the goodwill the fast answer was supposed to buy.
//
// Anybody reaching for one of these is, by definition, having a worse
// time than they expected: their flight died, the site would not take
// the booking, the car is not where it should be. So whatever the screen
// already knows goes in the first line, because the alternative is a
// guest typing a booking reference one-handed in an arrivals hall.
//
// One opener for all of them. A consistent greeting is the difference
// between a message that reads as coming from a system and one that
// reads as coming from somebody who happened to find the number.
import { formatDateTime } from "./datetime";

const HI = "Hi Cabby's —";

/**
 * The address that actually receives mail, named once.
 *
 * It was written out by hand in the footer and nowhere else, as
 * hello@cabbys.aw — a domain nobody owns, so every message sent to it
 * bounced silently. Now that it is real it appears in more than one
 * place, and more than one place is how the next stale address happens.
 */
export const SUPPORT_EMAIL = "cabbystransfer@gmail.com";

/** Enough of a trip to say which one, before it has a reference. */
export interface TripOutline {
  from: string;
  to: string;
  /** ISO date, as the booking state holds it */
  date: string;
  /** HH:MM, as the booking state holds it */
  time: string;
}

function outline(t: TripOutline): string {
  // The same unambiguous date the booking flow shows. A bare 08/01 read
  // by somebody who writes dates the other way round is a car on the
  // wrong day, and this string is the one a human acts on by hand.
  return `${t.from} → ${t.to}, ${formatDateTime(t.date, t.time)}`;
}

/** No context to give: the footer, the end of the FAQ, a general ask. */
export function askAnything(): string {
  return `${HI} I have a question.`;
}

/** A booking exists and we know which one. */
export function askAboutBooking(ref: string): string {
  return `${HI} about booking ${ref}.`;
}

/** A booking exists, and we can name the whole trip. */
export function askAboutTrip(ref: string, t: TripOutline): string {
  return `${HI} booking ${ref} (${outline(t)}).`;
}

/**
 * The flight is cancelled or diverted.
 *
 * Named separately rather than folded into askAboutBooking because this
 * is the one moment the guest is most likely to be standing somewhere
 * with a phone and no patience, and because the answer they want is a
 * specific one: not "how is my booking", but "is a car still coming".
 * Asking the question for them is most of the help.
 */
export function askAboutFlight(ref: string, flight: string, cancelled: boolean): string {
  const what = cancelled ? "has been cancelled" : "has been diverted";
  return `${HI} booking ${ref} — my flight ${flight} ${what}. What happens with my pickup?`;
}

/**
 * The site would not complete the booking.
 *
 * The message says what they were trying to do, because the point of
 * this one is that it can be finished by hand. A guest who has to
 * re-describe the trip they just filled in twice has been asked to do
 * the work the form already did.
 */
export function askToBookByHand(t: TripOutline): string {
  return `${HI} I'm trying to book ${outline(t)}, but the site is asking me to sign in. Could you book it by hand?`;
}

/** Inside the minimum notice window, where the booking needs a human. */
export function askAboutShortNotice(t: TripOutline): string {
  return `${HI} I need a transfer — ${outline(t)}. I know that's short notice; can you take it?`;
}
