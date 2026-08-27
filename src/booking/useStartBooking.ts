// One door into the flow: the card on the home page.
//
// The flow no longer asks where you are going — the card did, and asking a
// second time was the whole reason its first step existed. That only holds
// if nothing can reach the flow around the card, so every "Book now" on the
// site comes through here: with a route, it opens the flow; without one, it
// takes you to the card and puts the cursor in the field that is missing.
//
// Anything the button meant to say — a vehicle picked from the fleet grid, a
// party size — is carried either way, so choosing a car and then being asked
// for a route does not lose the car.
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBookingOptional, type Prefill } from "./BookingContext";

/** The booking card's anchor, set on the card itself in QuoteCard. */
export const CARD_ID = "book";

/** Frames to keep looking for the card after a route change — the home page
    has to mount first, and half a second covers it. Mirrors HashScroll. */
const MAX_FRAMES = 30;

function reveal() {
  const card = document.getElementById(CARD_ID);
  if (!card) return false;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  // The empty field, not the first one — someone who filled in a pickup and
  // stopped should land on the drop-off. preventScroll so focusing does not
  // cancel the scroll that just started.
  const inputs = card.querySelectorAll<HTMLInputElement>('input[role="combobox"]');
  const target = Array.from(inputs).find((i) => !i.value) ?? inputs[0];
  target?.focus({ preventScroll: true });
  return true;
}

export function useStartBooking() {
  const booking = useBookingOptional();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback((prefill?: Prefill) => {
    if (!booking) return;
    const { state, open, setField } = booking;
    const routed = !!(state.from && state.to && state.from.id !== state.to.id);
    if (routed) { open(prefill); return; }

    // Carry the intent to the card rather than dropping it on the floor.
    if (prefill?.vehicle) setField("vehicle", prefill.vehicle);
    if (prefill?.pax !== undefined) setField("pax", prefill.pax);
    if (prefill?.from) setField("from", prefill.from);
    if (prefill?.to) setField("to", prefill.to);

    if (pathname !== "/") navigate("/");
    let frames = 0;
    const look = () => { if (!reveal() && frames++ < MAX_FRAMES) requestAnimationFrame(look); };
    requestAnimationFrame(look);
  }, [booking, navigate, pathname]);
}
