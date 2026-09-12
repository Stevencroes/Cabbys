// "Where exactly should we collect you?"
//
// Two ways to answer, and neither is a map you drag.
//
//  · Tap once and the phone says where it is. Whoever is standing at the
//    pickup gets a better answer from GPS than they would from dragging a
//    dot, and gets it without reading a satellite view.
//  · Or write the spot down. "Blue gate, past the second speed bump."
//    This app has believed since the ride screen was written that the
//    landmark is what closes the last twenty metres — coordinates get you
//    near, a sentence gets you to the door. It is also the only one of
//    the two that works from another continent three weeks early, which
//    is when most of these bookings are made.
//
// Both are optional, and the panel says so. A guest being collected from
// a resort this app already knows the coordinates of loses nothing by
// ignoring it.
import { useState } from "react";
import {
  LOCATE_MESSAGES, locateMe, setPickupPin, pinWorthPrompting,
} from "../../lib/pickupPin";

interface PickupPinProps {
  rideId: string;
  pickup: string;
  /** what is already stored, so the panel can open as a confirmation */
  hasPin: boolean;
  note: string | null;
  onSaved: (pin: { lat: number; lng: number } | null, note: string) => void;
}

export default function PickupPin({ rideId, pickup, hasPin, note, onSaved }: PickupPinProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const known = hasPin || Boolean(note);
  const urge = pinWorthPrompting(pickup) && !known;

  async function locate() {
    setLocating(true);
    setProblem(null);
    const res = await locateMe();
    setLocating(false);
    if (!res.ok) { setProblem(LOCATE_MESSAGES[res.why]); return; }
    setPin({ lat: res.lat, lng: res.lng });
  }

  async function save() {
    if (!pin && !draft.trim()) {
      setProblem("Add a note or share your location — otherwise there's nothing to send.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const res = await setPickupPin(rideId, pin, draft);
    setBusy(false);
    if (!res.ok) { setProblem(res.detail); return; }
    setDone(true);
    onSaved(pin, draft.trim());
  }

  if (!open) {
    return (
      <button
        type="button"
        className={`tp-pinopen${urge ? " urge" : ""}`}
        onClick={() => setOpen(true)}
      >
        <span className="pk">{known ? "Pickup spot set" : "Set your exact pickup spot"}</span>
        <span className="pv">
          {known
            ? note || "Your driver has your location."
            : urge
            ? `We have “${pickup}” — tell your driver exactly where to stop.`
            : "Optional — a landmark or your location, if it helps."}
        </span>
      </button>
    );
  }

  return (
    <div className="tp-pin">
      <div className="pin-h">
        <b>Where exactly should we collect you?</b>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">✕</button>
      </div>

      <p className="pin-sub">
        Both optional. A landmark is often better than a map — “the blue gate past the
        second speed bump” gets a driver to you faster than a dot does.
      </p>

      <label className="pin-l" htmlFor={`pin-note-${rideId}`}>Describe the spot</label>
      <textarea
        id={`pin-note-${rideId}`}
        rows={2}
        value={draft}
        placeholder="Blue gate, past the second speed bump"
        onChange={(e) => { setDraft(e.target.value); setDone(false); }}
      />

      <div className="pin-or"><span>and, if you're there now</span></div>

      <button type="button" className="btn-ghost pin-loc" onClick={() => void locate()} disabled={locating || busy}>
        {locating ? "Finding you…" : pin ? "Location shared ✓" : "Use my current location"}
      </button>
      {pin && (
        <p className="pin-got">
          Pinned to where you're standing — tap again to update it. If you're not at the
          pickup yet, leave this out and the note will do the work.
        </p>
      )}

      {problem && <p className="pin-err" role="alert">{problem}</p>}
      {done && !problem && <p className="pin-ok" role="status">Saved — your driver will see this.</p>}

      <button type="button" className="btn primary pin-save" onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save for my driver"}
      </button>
    </div>
  );
}
