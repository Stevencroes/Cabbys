// ── "Help your driver find you" ───────────────────────────────────────
//
// The guest-facing half of the pin. What it offers depends on what kind
// of place they are being collected from, and pickupPin.ts holds the
// reasoning for that — in short: the airport is never asked, a resort is
// asked which entrance, and only an address gets a coordinate, and only
// while the guest is close enough to the pickup to be standing on it.
//
// Two controls that look similar and are not:
//
//   The NOTE is knowledge. "Main lobby, by the fountain." It can be
//   given the moment the booking exists and it is the more valuable of
//   the two — the driver's screen puts it ABOVE the map on purpose.
//
//   The SPOT is a position, and it is only true while the guest is on
//   it. Offered inside a window around the pickup and never outside one,
//   because a coordinate captured at home three weeks early is not a
//   worse pin, it is a wrong one, and the driver's map will zoom to door
//   level on it and call it "Guest pinned".
//
// Nothing here is required. A guest who ignores this screen entirely
// gets exactly what they got before it existed, which is a driver with
// the resort's own door and a phone number.
import { useState } from "react";
import {
  pinPolicyFor, pinWindowOpen, readPosition, savePickupPin,
} from "../lib/pickupPin";

export interface PinnableRide {
  id: string;
  pickup_location: string;
  scheduled_at?: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_note?: string | null;
}

const NOTE_MAX = 140;

export default function PickupPin({
  ride,
  now = Date.now(),
  onSaved,
}: {
  ride: PinnableRide;
  /** injected so the window can be tested without moving the clock */
  now?: number;
  onSaved?: (patch: { pickup_lat?: number; pickup_lng?: number; pickup_note?: string }) => void;
}) {
  const policy = pinPolicyFor(ride.pickup_location);
  const [note, setNote] = useState(ride.pickup_note ?? "");
  const [busy, setBusy] = useState<"spot" | "note" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [pinned, setPinned] = useState(ride.pickup_lat != null && ride.pickup_lng != null);

  // The airport has one transfer bay and an exact point already. There is
  // no question to ask, so there is no card.
  if (policy === "airport") return null;

  const canDropSpot = policy === "address" && pinWindowOpen(ride.scheduled_at, now);
  const saved = (ride.pickup_note ?? "") === note.trim();

  async function sendSpot() {
    setBusy("spot");
    setProblem(null);
    setSaid(null);
    const where = await readPosition();
    if ("error" in where) {
      setBusy(null);
      setProblem(where.error);
      return;
    }
    const res = await savePickupPin(ride.id, { lat: where.lat, lng: where.lng });
    setBusy(null);
    if (!res.ok) { setProblem(res.detail); return; }
    setPinned(true);
    setSaid("Your driver can see exactly where you are.");
    onSaved?.({ pickup_lat: where.lat, pickup_lng: where.lng });
  }

  async function sendNote() {
    const clean = note.trim().slice(0, NOTE_MAX);
    setBusy("note");
    setProblem(null);
    setSaid(null);
    const res = await savePickupPin(ride.id, { note: clean });
    setBusy(null);
    if (!res.ok) { setProblem(res.detail); return; }
    setSaid(clean ? "Sent to your driver." : "Cleared.");
    onSaved?.({ pickup_note: clean });
  }

  const label = policy === "place" ? "Which entrance?" : "Help your driver find you";
  const why = policy === "place"
    ? "Big resorts have more than one way in. Tell us where to wait and your driver will be there."
    : canDropSpot
    ? "One tap sends your exact spot. A landmark still helps — it closes the last twenty metres."
    : "A landmark saves a phone call. Closer to your pickup we'll also offer to send your exact spot.";

  return (
    <section className="tp-pin" aria-label={label}>
      <div className="pk-k">{label}</div>
      <p className="pk-why">{why}</p>

      {canDropSpot && (
        <button
          type="button"
          className={`btn-ghost pk-spot${pinned ? " done" : ""}`}
          onClick={() => void sendSpot()}
          disabled={busy !== null}
        >
          {busy === "spot"
            ? "Finding you…"
            : pinned
            ? "Send my spot again"
            : "I'm here — send my exact spot"}
        </button>
      )}

      <label className="pk-note">
        <span className="pk-nk">
          {policy === "place" ? "Where to wait" : "Landmark"}
        </span>
        <textarea
          value={note}
          maxLength={NOTE_MAX}
          rows={2}
          placeholder={policy === "place"
            ? "Main lobby, by the fountain"
            : "Blue gate, opposite the pharmacy"}
          onChange={(e) => { setNote(e.target.value); setSaid(null); }}
        />
      </label>

      <div className="pk-foot">
        {/* The count appears once it is worth knowing about, not as a
            permanent reminder that this field has a limit. */}
        <span className="pk-count">
          {note.length > NOTE_MAX - 30 ? `${NOTE_MAX - note.length} left` : ""}
        </span>
        <button
          type="button"
          className="btn-ghost pk-save"
          onClick={() => void sendNote()}
          disabled={busy !== null || saved}
        >
          {busy === "note" ? "Sending…" : saved ? "Saved" : "Send to driver"}
        </button>
      </div>

      {/* Both outcomes are sentences, and both are announced — a colour
          change alone would say nothing to a screen reader and not much
          to anyone reading a phone in the sun. */}
      {problem && <p className="pk-bad" role="alert">{problem}</p>}
      {said && <p className="pk-ok" role="status">{said}</p>}
    </section>
  );
}
