// Profile — who you are to us, what you can change, and the way out.
//
// Status is shown but never editable: the database refuses a driver
// changing their own status, so offering the control would be a lie.
//
// The phone number is the opposite case, and the screen used to lie in
// that direction instead. One line — "Vehicle and plate are set by
// Cabby's. Message us to change them." — sat under all three rows, so a
// driver with a new number was told to open a WhatsApp thread and wait,
// for a field the database has permitted them to write all along (the
// "drivers: update own" policy in docs/driver-schema.sql). It is the
// number guests and dispatch reach them on; a stale one is a missed
// pickup. It is editable here now, and the sentence about Cabby's has
// moved down to the two rows it was ever about.
//
// Signing out asks first. It is one tap from the tab bar a driver uses
// all shift, and the way back in is an email and a password they may not
// have on them at the airport at 6am.
import { useState } from "react";
import { useAuth } from "../../booking/useAuth";
import { saveDriverPhone, type DriverProfile } from "../lib/driver";
import { isValidPhone, normalizePhone } from "../../lib/contact";
import { whatsappLink } from "../../lib/whatsapp";

export default function Profile({ driver }: { driver: DriverProfile }) {
  const { signOut } = useAuth();
  const [phone, setPhone] = useState(driver.phone ?? "");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const help = whatsappLink(
    `Hello Cabby's, this is ${driver.fullName || "one of your drivers"} — I need a hand with my driver account.`,
  );

  async function save() {
    const next = normalizePhone(draft ?? "");
    if (!isValidPhone(next)) {
      setProblem("That doesn't look like a number we could dial.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const res = await saveDriverPhone(next);
    setBusy(false);
    if (!res.ok) { setProblem(res.detail); return; }
    setPhone(next);
    setDraft(null);
    setSaved(true);
  }

  return (
    <div className="drv-view">
      <div className="drv-pad">
        <div className="kick">Profile</div>
        <h1 className="big">{driver.fullName || "Driver"}</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          {driver.rating != null ? `${driver.rating.toFixed(1)} ★ · ` : ""}
          {driver.tripsCount} trip{driver.tripsCount === 1 ? "" : "s"} completed
        </p>

        <div style={{ marginTop: 18 }}>
          <span className={`drv-badge ${driver.status}`}>{driver.status}</span>
        </div>

        <div className="drv-rowset" style={{ marginTop: 22 }}>
          {draft === null ? (
            <div className="drv-r">
              <span className="rl">Phone</span>
              <span className="rv">
                {phone || "—"}
                <button
                  type="button"
                  className="drv-inline"
                  onClick={() => { setDraft(phone); setProblem(null); setSaved(false); }}
                >
                  {phone ? "Change" : "Add"}
                </button>
              </span>
            </div>
          ) : (
            <div className="drv-r edit">
              <label className="rl" htmlFor="drv-phone">Phone</label>
              <input
                id="drv-phone"
                type="tel"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                placeholder="+297 560 7336"
              />
              <span className="acts">
                <button type="button" className="drv-inline" onClick={() => setDraft(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="drv-inline go" onClick={() => void save()} disabled={busy}>
                  {busy ? "…" : "Save"}
                </button>
              </span>
            </div>
          )}
          <div className="drv-r"><span className="rl">Vehicle</span><span className="rv">{driver.vehicle || "—"}</span></div>
          <div className="drv-r"><span className="rl">Plate</span><span className="rv">{driver.plate || "—"}</span></div>
        </div>

        {problem && (
          <div className="drv-refused" role="alert" style={{ marginTop: 0, marginBottom: 14 }}>
            <div className="rk">Couldn't save that</div>
            <p>{problem}</p>
          </div>
        )}
        {saved && (
          <div className="drv-refused ok" role="status" style={{ marginTop: 0, marginBottom: 14 }}>
            <div className="rk">Saved</div>
            <p>Guests and dispatch will reach you on {phone}.</p>
          </div>
        )}

        <p className="sub" style={{ fontSize: "11.5px", marginBottom: 20 }}>
          Vehicle and plate are set by Cabby's — message us to change those.
        </p>

        {help && (
          <a className="drv-cta ghost" href={help} target="_blank" rel="noreferrer">
            Message Cabby's ↗
          </a>
        )}

        {/* One tap from a tab bar used all shift, and the way back in is a
            password nobody has at the airport at 6am. */}
        {confirming ? (
          <div className="drv-confirm" role="group" aria-label="Confirm sign out">
            <p>Sign out of the driver portal? You'll need your email and password to get back in.</p>
            <div className="row">
              <button type="button" className="drv-cta ghost" onClick={() => setConfirming(false)}>Stay signed in</button>
              <button type="button" className="drv-cta red" onClick={() => signOut()}>Sign out</button>
            </div>
          </div>
        ) : (
          <button type="button" className="drv-cta ghost" onClick={() => setConfirming(true)}>Sign out</button>
        )}
      </div>
    </div>
  );
}
