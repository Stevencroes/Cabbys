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
//
// THE CAR IS THE OTHER HALF OF A PICKUP. rides.driver_name,
// driver_phone, driver_vehicle and driver_plate have been on the rides
// table since docs/schema.sql and were never written by anything, so My
// Trips drew an empty space where the driver should be and a guest
// standing outside arrivals had nothing to look for. claim_ride() stamps
// them now, which only helps if the car is actually on record — so it is
// editable here, colour first, because somebody scanning a kerb sees a
// colour before they see a badge.
//
// Vehicle and plate used to say "set by Cabby's", which was true of the
// intent and false of the software: there is no admin screen in this
// codebase, so "set by Cabby's" meant somebody typing into Supabase by
// hand, and in practice meant nothing was set at all. A driver knows
// their own plate. Cabby's can lock this down with an RLS change the day
// there is a console to do it from.
import { useRef, useState } from "react";
import { useAuth } from "../../booking/useAuth";
import {
  saveDriverPhone, saveVehicle, uploadDriverPhoto, vehicleLabel,
  type DriverProfile,
} from "../lib/driver";
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

  // the car, held as strings while it is being typed
  const [car, setCar] = useState({
    make: driver.make ?? "", model: driver.model ?? "", colour: driver.colour ?? "",
    year: driver.year != null ? String(driver.year) : "",
    plate: driver.plate ?? "",
    seats: driver.seats != null ? String(driver.seats) : "",
    bags: driver.bags != null ? String(driver.bags) : "",
  });
  const [photo, setPhoto] = useState(driver.photoUrl);
  const [editingCar, setEditingCar] = useState(false);
  const [carBusy, setCarBusy] = useState(false);
  const [carSaved, setCarSaved] = useState(false);
  const [carProblem, setCarProblem] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const shown = vehicleLabel({ ...driver, ...car, colour: car.colour || driver.colour });

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setCarBusy(true);
    setCarProblem(null);
    const res = await uploadDriverPhoto(file);
    setCarBusy(false);
    if (!res.ok) { setCarProblem(res.detail); return; }
    setPhoto(res.url);
    setCarSaved(false);
  }

  const num = (v: string) => {
    const n = Number(v.trim());
    return v.trim() === "" || !Number.isFinite(n) ? null : Math.round(n);
  };

  async function saveCar() {
    if (!car.plate.trim()) {
      setCarProblem("The plate is the one thing a guest can check from across a car park.");
      return;
    }
    setCarBusy(true);
    setCarProblem(null);
    const res = await saveVehicle({
      make: car.make, model: car.model, colour: car.colour,
      year: num(car.year), plate: car.plate,
      seats: num(car.seats), bags: num(car.bags),
      photoUrl: photo,
    });
    setCarBusy(false);
    if (!res.ok) { setCarProblem(res.detail); return; }
    setEditingCar(false);
    setCarSaved(true);
  }

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
          {/* Read-only, and not for want of a form: the address is the
              account itself, so changing it is an auth operation with a
              confirmation mail attached, not a profile edit. It is here
              because a driver asking support which account they are on
              should not have to go and find out. */}
          <div className="drv-r"><span className="rl">Email</span><span className="rv">{driver.email || "—"}</span></div>
        </div>

        {/* ── the car a guest will be looking for ── */}
        <div className="drv-car">
          <div className="car-h">
            <span className="ck">Your car</span>
            {!editingCar && (
              <button type="button" className="drv-inline" onClick={() => { setEditingCar(true); setCarSaved(false); setCarProblem(null); }}>
                {shown ? "Change" : "Add"}
              </button>
            )}
          </div>

          {/* What the guest sees, shown the way they will see it — a face,
              a colour and a plate, not a form. */}
          <div className="car-face">
            {photo
              ? <img src={photo} alt="" />
              : <span className="ph" aria-hidden="true">{(driver.fullName || "?").trim().charAt(0).toUpperCase()}</span>}
            <span className="car-id">
              <span className="cn">{shown || "No car on record"}</span>
              <span className="cp">{car.plate || "No plate"}</span>
            </span>
          </div>

          {editingCar ? (
            <>
              <div className="car-grid">
                <label htmlFor="v-colour">Colour</label>
                <input id="v-colour" value={car.colour} placeholder="Black"
                  onChange={(e) => setCar({ ...car, colour: e.target.value })} />
                <label htmlFor="v-make">Make</label>
                <input id="v-make" value={car.make} placeholder="Mercedes"
                  onChange={(e) => setCar({ ...car, make: e.target.value })} />
                <label htmlFor="v-model">Model</label>
                <input id="v-model" value={car.model} placeholder="V-Class"
                  onChange={(e) => setCar({ ...car, model: e.target.value })} />
                <label htmlFor="v-plate">Plate</label>
                <input id="v-plate" value={car.plate} placeholder="A-42871"
                  onChange={(e) => setCar({ ...car, plate: e.target.value })} />
                <label htmlFor="v-year">Year</label>
                <input id="v-year" value={car.year} inputMode="numeric" placeholder="2023"
                  onChange={(e) => setCar({ ...car, year: e.target.value })} />
                <label htmlFor="v-seats">Seats</label>
                <input id="v-seats" value={car.seats} inputMode="numeric" placeholder="7"
                  onChange={(e) => setCar({ ...car, seats: e.target.value })} />
                <label htmlFor="v-bags">Bags</label>
                <input id="v-bags" value={car.bags} inputMode="numeric" placeholder="6"
                  onChange={(e) => setCar({ ...car, bags: e.target.value })} />
              </div>

              <input
                ref={pick}
                id="v-photo"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void choosePhoto(e.target.files?.[0])}
              />
              <button type="button" className="drv-cta ghost car-photo" onClick={() => pick.current?.click()} disabled={carBusy}>
                {photo ? "Change your photo" : "Add your photo"}
              </button>

              <div className="car-acts">
                <button type="button" className="drv-cta ghost" onClick={() => setEditingCar(false)} disabled={carBusy}>
                  Cancel
                </button>
                <button type="button" className="drv-cta green" onClick={() => void saveCar()} disabled={carBusy}>
                  {carBusy ? "…" : "Save"}
                </button>
              </div>
            </>
          ) : (
            <dl className="car-spec">
              <div><dt>Year</dt><dd>{driver.year ?? "—"}</dd></div>
              <div><dt>Seats</dt><dd>{driver.seats ?? "—"}</dd></div>
              <div><dt>Bags</dt><dd>{driver.bags ?? "—"}</dd></div>
            </dl>
          )}

          {carProblem && (
            <div className="drv-refused" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
              <div className="rk">Couldn't save the car</div>
              <p>{carProblem}</p>
            </div>
          )}
          {carSaved && (
            <div className="drv-refused ok" role="status" style={{ marginTop: 12, marginBottom: 0 }}>
              <div className="rk">Saved</div>
              <p>Guests will be looking for {shown || "your car"}{car.plate ? `, plate ${car.plate}` : ""}.</p>
            </div>
          )}

          <p className="car-note">
            This is what your guests see in their booking, and what they look for at the kerb.
            It's stamped onto every ride you take — change it here and your upcoming rides
            change with it.
          </p>
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
          Message us to move your account to a different email.
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
