// The driver application — what a signed-in account with no drivers row
// sees at /drive.
//
// That screen used to be "No driver profile for this account": a dead end
// with an account id to quote at support, because driver records were made
// by Cabby's in the SQL editor. Drivers apply for themselves now (the owner,
// October 2026), so the same state is where an application is filled in.
//
// It asks for what an operator needs to decide, and nothing they don't:
// who to put on a booking (name, a phone a guest can reach), and the car
// a guest will be looking for. Documents come next, on the waiting screen
// that already takes them (Documents.tsx); the photo comes once approved,
// on Profile, where it is shown the way a guest will see it.
//
// Two calls, in order: apply_as_driver makes the row (pending, always), then
// save_driver_vehicle fills in the car. They are not one transaction. If the
// car fails after the row is made, the form stays up with the error and the
// same button tries again — apply_as_driver answers ok on an account that
// already has a row, so the second press goes straight to the car. Moving on
// with the car unsaved would strand it: a pending driver has no screen where
// a car can be entered.
import { useState } from "react";
import { applyAsDriver, saveVehicle, type AuthedUser } from "./lib/driver";
import { whatsappLink } from "../lib/whatsapp";
import Steps from "./Steps";

interface ApplyProps {
  user: AuthedUser;
  /** a first name to start from — what they typed when creating the account */
  suggestedName?: string;
  /** called once the row and the car are both saved */
  onApplied: () => void;
  onSignOut: () => void;
}

type Field = "first" | "phone" | "make" | "model" | "colour" | "plate";

const num = (v: string): number | null => {
  const n = parseInt(v.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

export default function Apply({ user, suggestedName = "", onApplied, onSignOut }: ApplyProps) {
  const cut = suggestedName.trim().indexOf(" ");
  const [first, setFirst] = useState(cut === -1 ? suggestedName.trim() : suggestedName.trim().slice(0, cut));
  const [last, setLast] = useState(cut === -1 ? "" : suggestedName.trim().slice(cut + 1));
  const [phone, setPhone] = useState("");
  const [car, setCar] = useState({ colour: "", make: "", model: "", plate: "", year: "", seats: "", bags: "" });
  const [missing, setMissing] = useState<Set<Field>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ detail: string; setup?: boolean } | null>(null);

  function check(): boolean {
    const gaps = new Set<Field>();
    if (!first.trim()) gaps.add("first");
    if (phone.replace(/\D/g, "").length < 7) gaps.add("phone");
    if (!car.make.trim()) gaps.add("make");
    if (!car.model.trim()) gaps.add("model");
    if (!car.colour.trim()) gaps.add("colour");
    if (!car.plate.trim()) gaps.add("plate");
    setMissing(gaps);
    return gaps.size === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // a double-tap on a slow connection must not double-fire
    setProblem(null);
    if (!check()) return;
    setBusy(true);
    const applied = await applyAsDriver({ firstName: first.trim(), lastName: last.trim(), phone: phone.trim() });
    if (!applied.ok) {
      setBusy(false);
      setProblem({ detail: applied.detail, setup: applied.setup });
      return;
    }
    const saved = await saveVehicle({
      make: car.make, model: car.model, colour: car.colour, plate: car.plate,
      year: num(car.year), seats: num(car.seats), bags: num(car.bags),
    });
    setBusy(false);
    if (!saved.ok) {
      setProblem({ detail: `Your details are in, but the car didn't save: ${saved.detail} Try again.` });
      return;
    }
    onApplied();
  }

  const help = whatsappLink(
    `Hello Cabby's — I'm trying to apply as a driver and it isn't working. My account is ${user.email ?? "(no email)"}, id ${user.id}.`,
  );

  /** a field's error line, said where the field is */
  const err = (f: Field, text: string) =>
    missing.has(f) ? <p className="ferr" id={`ap-${f}-err`} role="alert">{text}</p> : null;
  const aria = (f: Field) =>
    missing.has(f) ? { "aria-invalid": true as const, "aria-describedby": `ap-${f}-err` } : {};

  return (
    <div className="drv-apply">
      <Steps current={2} />
      <h1>Tell us about you.</h1>
      <p>Your name and car go on the booking your guest receives, so use the ones they'll see.</p>

      <form className="ap-form" onSubmit={submit} noValidate>
        <fieldset>
          <legend>You</legend>
          <div className="ap-row two">
            <div className="ap-f">
              <label htmlFor="ap-first">First name</label>
              <input id="ap-first" autoComplete="given-name" value={first}
                onChange={(e) => setFirst(e.target.value)} {...aria("first")} />
              {err("first", "Add your first name.")}
            </div>
            <div className="ap-f">
              <label htmlFor="ap-last">Last name</label>
              <input id="ap-last" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
          </div>
          <div className="ap-f">
            <label htmlFor="ap-phone">Phone <span className="hint">with WhatsApp, if you have it</span></label>
            <input id="ap-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+297 560 0000"
              value={phone} onChange={(e) => setPhone(e.target.value)} {...aria("phone")} />
            {err("phone", "Add a number your guests and Cabby's can reach you on.")}
          </div>
        </fieldset>

        <fieldset>
          <legend>Your car</legend>
          <div className="ap-row two">
            <div className="ap-f">
              <label htmlFor="ap-make">Make</label>
              <input id="ap-make" placeholder="Mercedes" value={car.make}
                onChange={(e) => setCar({ ...car, make: e.target.value })} {...aria("make")} />
              {err("make", "Add the make.")}
            </div>
            <div className="ap-f">
              <label htmlFor="ap-model">Model</label>
              <input id="ap-model" placeholder="E-Class" value={car.model}
                onChange={(e) => setCar({ ...car, model: e.target.value })} {...aria("model")} />
              {err("model", "Add the model.")}
            </div>
          </div>
          <div className="ap-row two">
            <div className="ap-f">
              <label htmlFor="ap-colour">Colour</label>
              <input id="ap-colour" placeholder="Black" value={car.colour}
                onChange={(e) => setCar({ ...car, colour: e.target.value })} {...aria("colour")} />
              {err("colour", "Add the colour — it's what a guest looks for first.")}
            </div>
            <div className="ap-f">
              <label htmlFor="ap-plate">Plate</label>
              <input id="ap-plate" placeholder="A-42871" autoCapitalize="characters" value={car.plate}
                onChange={(e) => setCar({ ...car, plate: e.target.value })} {...aria("plate")} />
              {err("plate", "Add the plate.")}
            </div>
          </div>
          <div className="ap-row three">
            <div className="ap-f">
              <label htmlFor="ap-year">Year</label>
              <input id="ap-year" inputMode="numeric" placeholder="2023" value={car.year}
                onChange={(e) => setCar({ ...car, year: e.target.value })} />
            </div>
            <div className="ap-f">
              <label htmlFor="ap-seats">Seats</label>
              <input id="ap-seats" inputMode="numeric" placeholder="4" value={car.seats}
                onChange={(e) => setCar({ ...car, seats: e.target.value })} />
            </div>
            <div className="ap-f">
              <label htmlFor="ap-bags">Bags</label>
              <input id="ap-bags" inputMode="numeric" placeholder="3" value={car.bags}
                onChange={(e) => setCar({ ...car, bags: e.target.value })} />
            </div>
          </div>
        </fieldset>

        {problem && (
          <div className="drv-refused" role="alert">
            <span className="rk">{problem.setup ? "Not switched on yet" : "That didn't go through"}</span>
            <p>{problem.detail}</p>
            {/* Not for the driver: the line whoever runs the database needs. */}
            {problem.setup && <p className="drv-why">Run docs/driver-signup-schema.sql in the Supabase SQL editor.</p>}
          </div>
        )}

        <button type="submit" className="drv-cta green" disabled={busy} aria-busy={busy || undefined}>
          {busy ? "Sending…" : "Send application"}
        </button>
        {problem && help && (
          <a className="drv-cta ghost" href={help} target="_blank" rel="noreferrer">Message Cabby's ↗</a>
        )}
      </form>

      <p className="ap-who">
        Applying as <b>{user.email ?? "this account"}</b>.{" "}
        <button type="button" className="drv-quiet inline" onClick={onSignOut}>Not you? Sign out</button>
      </p>
    </div>
  );
}
