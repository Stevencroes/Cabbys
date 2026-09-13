// The approval gate.
//
// This is a route guard, not hidden UI: an unapproved driver never gets the
// portal rendered at all, so there is nothing to reveal with devtools. The
// database agrees — claim_ride and set_ride_status both refuse anyone whose
// drivers.status is not 'approved'.
//
// Drivers sign in with the same accounts as passengers — one Supabase
// project, one identity system (see AuthForm). What decides whether they
// get the portal is not a separate login, but whether their signed-in
// account has an approved row in `drivers`. That split matters for
// diagnosis: "not signed in", "signed in but no driver row", "signed in
// but not yet approved" and "approved" are different problems with
// different fixes, so they get different screens.
//
// There is now a fifth, and it is the one this file got wrong. A missing
// drivers ROW and an unreadable drivers TABLE both arrived here as null,
// so a driver on hotel wifi with one bar — or a deployment where
// docs/driver-schema.sql had not been run — was told "No driver profile
// for this account" and shown their own account id to quote at support.
// They would then spend a morning proving an account exists that was
// never in question. Every other screen in this portal draws that line
// ("Can't reach the pool", "Can't read your schedule"); the gate, which
// is where a driver hits it first, was the last place that didn't.
//
// Two more things every gate now has, because a driver standing outside
// the portal has exactly two useful moves and neither was offered:
//   · Check again — approval happens on Cabby's side while this screen is
//     open, and the only way to see it land was to sign out and back in.
//   · A way to reach a human, carrying the account id, so the first reply
//     is an answer rather than a request for details.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import AuthForm from "../components/auth/AuthForm";
import { useAuth } from "../booking/useAuth";
import { supabase } from "../lib/supabase";
import { getAuthedUser, loadDriverById, type AuthedUser, type DriverProfile } from "./lib/driver";
import { whatsappLink } from "../lib/whatsapp";
import "../styles/driver.css";

interface GateProps {
  /**
   * `reload` re-reads the drivers row. Profile needs it: saving a car
   * updates the database but not the copy the shell is holding, so the
   * "your guests can't spot you" band would sit there over a driver who
   * had just fixed exactly that, until they reloaded the page.
   */
  children: (driver: DriverProfile, reload: () => void) => ReactNode;
}

type State =
  | { phase: "loading" }
  | { phase: "signed-out" }
  | { phase: "no-driver"; user: AuthedUser }
  | { phase: "unreachable"; user: AuthedUser; detail: string }
  | { phase: "blocked"; driver: DriverProfile; user: AuthedUser }
  | { phase: "ready"; driver: DriverProfile };

export default function DriverGuard({ children }: GateProps) {
  const [state, setState] = useState<State>({ phase: "loading" });
  /** a re-check the driver asked for, so the button can say it is working */
  const [checking, setChecking] = useState(false);
  const live = useRef(true);
  const { signOut } = useAuth();

  const refresh = useCallback(async () => {
    const user = await getAuthedUser();
    if (!live.current) return;
    if (!user) { setState({ phase: "signed-out" }); return; }
    const { driver, error } = await loadDriverById(user.id);
    if (!live.current) return;
    if (error) { setState({ phase: "unreachable", user, detail: error }); return; }
    if (!driver) { setState({ phase: "no-driver", user }); return; }
    // The address a driver signs in with lives in auth, not in the
    // drivers row — the gate is the only place that holds both, so it is
    // the only place that can put them together. Profile shows it so a
    // driver asking support "which account am I?" has the answer where
    // they are already looking.
    const withEmail = { ...driver, email: user.email ?? driver.email };
    if (driver.status !== "approved") { setState({ phase: "blocked", driver: withEmail, user }); return; }
    setState({ phase: "ready", driver: withEmail });
  }, []);

  /** the same read, with a word that it is happening */
  const check = useCallback(async () => {
    setChecking(true);
    await refresh();
    if (live.current) setChecking(false);
  }, [refresh]);

  useEffect(() => {
    live.current = true;
    refresh();
    // Sign-in and sign-out both land here without a page reload — a
    // password sign-in resolves in place, and Google OAuth returns via
    // /auth/callback?next=/drive (see useAuth.signInWithProvider).
    const { data } = supabase.auth.onAuthStateChange(() => { refresh(); });
    return () => {
      live.current = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  if (state.phase === "ready") return <>{children(state.driver, refresh)}</>;

  // The hold. Short, but it is the first thing a driver sees on every cold
  // open, and it was an unstyled grey line on a black screen.
  if (state.phase === "loading") {
    return (
      <Gate>
        <Wordmark />
        <p className="drv-hold">One moment.</p>
      </Gate>
    );
  }

  if (state.phase === "signed-out") {
    return (
      <Gate>
        <Wordmark />
        <h1>This is the driver portal.</h1>
        <p>Sign in with the account Cabby's set up for you.</p>
        <div className="drv-auth-wrap">
          <AuthForm heading="Driver sign-in" oauthNext="/drive" onSuccess={refresh} allowSignUp={false} />
        </div>
        {/* A guest who lands here by accident had no way out but the back
            button — and the back button is where they came from. */}
        <a className="drv-wayout" href="/">Not a driver? Book a ride instead</a>
      </Gate>
    );
  }

  if (state.phase === "unreachable") {
    return (
      <Gate>
        <Mark tone="alert"><Broken /></Mark>
        <h1>Can't reach Cabby's.</h1>
        <p>
          Your account is fine — this portal just can't read it right now. Check your
          signal and try again; if it keeps happening, message us and we'll sort it.
        </p>
        <Diag user={state.user} id />
        {/* Not for the driver. This is the line whoever fixes it needs,
            and it says where the fix lives — which is not on this screen. */}
        <p className="drv-why">
          {state.detail}
          <br />Run the latest docs/driver-schema.sql if this persists.
        </p>
        <Actions
          user={state.user}
          checking={checking}
          onCheck={check}
          onSignOut={signOut}
          checkLabel="Try again"
          topic="the driver portal can't read my account"
        />
      </Gate>
    );
  }

  if (state.phase === "no-driver") {
    return (
      <Gate>
        <Mark>?</Mark>
        <h1>No driver profile for this account.</h1>
        <p>
          You're signed in, and we read the driver list fine — there's just no record
          in it matching this account. If Cabby's has only just set you up, check
          again in a minute. Otherwise the details below will find the mismatch.
        </p>
        <Diag user={state.user} id />
        <Actions
          user={state.user}
          checking={checking}
          onCheck={check}
          onSignOut={signOut}
          topic="I'm signed in but there's no driver profile for my account"
        />
      </Gate>
    );
  }

  const suspended = state.driver.status === "suspended";
  return (
    <Gate>
      <Mark tone={suspended ? "alert" : undefined}>{suspended ? <Hold /> : <Clock />}</Mark>
      <h1>{suspended ? "Your account is on hold." : "Application received."}</h1>
      <p>
        {suspended
          ? "You can't take jobs until this is lifted. Message us and we'll pick it up from there."
          : "We're checking your licence and vehicle details. You'll get a message the moment you're approved — usually within a day."}
      </p>
      {/* Whose application. A driver with two accounts, waiting on the
          wrong one, cannot see that from a screen that names neither. */}
      <Diag user={state.user} name={state.driver.fullName} nameLabel={suspended ? "Driver" : "Applied as"} />
      <Actions
        user={state.user}
        checking={checking}
        onCheck={check}
        onSignOut={signOut}
        checkLabel={suspended ? "Check again" : "Check if I'm approved"}
        urgent={suspended}
        topic={suspended ? "my driver account is on hold" : "I'm waiting on driver approval"}
      />
    </Gate>
  );
}

/** Every gate is the same frame — one mark, one sentence, one way forward. */
function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="drv">
      <div className="drv-gate">{children}</div>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="drv-mark gate">
      Cabby<span className="ap">'</span>s
      <small>Driver</small>
    </span>
  );
}

function Mark({ children, tone }: { children: ReactNode; tone?: "alert" }) {
  return <div className={`gi${tone === "alert" ? " stop" : ""}`} aria-hidden="true">{children}</div>;
}

/**
 * Who this is. The account id shows only where finding a mismatch is the
 * task — a driver waiting on approval needs to know WHICH account they
 * are waiting on, not to read a UUID off their own screen. The message
 * link carries it either way.
 */
function Diag({ user, name, nameLabel = "Applied as", id }: {
  user: AuthedUser; name?: string; nameLabel?: string; id?: boolean;
}) {
  return (
    <div className="drv-diag">
      {name && <div className="row"><span className="k">{nameLabel}</span><span className="v">{name}</span></div>}
      <div className="row"><span className="k">Signed in as</span><span className="v">{user.email ?? "—"}</span></div>
      {id && <div className="row"><span className="k">Account ID</span><span className="v mono">{user.id}</span></div>}
    </div>
  );
}

interface ActionsProps {
  user: AuthedUser;
  checking: boolean;
  onCheck: () => void;
  onSignOut: () => void;
  checkLabel?: string;
  /** the suspended case, where reaching a human IS the instruction */
  urgent?: boolean;
  /** what the driver is writing to us about, dropped into the message */
  topic: string;
}

function Actions({ user, checking, onCheck, onSignOut, checkLabel, urgent, topic }: ActionsProps) {
  // Carries the account id, so the first reply out of Cabby's can be an
  // answer rather than a request for details.
  const help = whatsappLink(
    `Hello Cabby's — ${topic}. My account is ${user.email ?? "(no email on file)"}, id ${user.id}.`,
  );
  const recheck = (
    <button type="button" className="drv-cta ghost" onClick={onCheck} disabled={checking}>
      {checking ? "Checking…" : checkLabel ?? "Check again"}
    </button>
  );
  const message = help && (
    <a className={`drv-cta ${urgent ? "red" : "ghost"}`} href={help} target="_blank" rel="noreferrer">
      Message Cabby's ↗
    </a>
  );
  // Reading order is priority order. On a held account, messaging us IS
  // the instruction in the paragraph above — it should not be sitting
  // underneath a button that will keep answering "still on hold".
  return (
    <div className="drv-gateacts">
      {urgent ? <>{message}{recheck}</> : <>{recheck}{message}</>}
      <button type="button" className="drv-quiet" onClick={onSignOut}>Sign out</button>
    </div>
  );
}

/* Drawn, not typed. The pending state wore an hourglass emoji, which
   every platform renders in its own colours — the one thing in a
   monochrome system guaranteed not to match it. */
function Clock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" strokeLinecap="round" />
    </svg>
  );
}

function Hold() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.4 8.4l7.2 7.2" strokeLinecap="round" />
    </svg>
  );
}

function Broken() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M10.5 7.5L13 5a3.5 3.5 0 0 1 5 5l-2.5 2.5" strokeLinecap="round" />
      <path d="M13.5 16.5L11 19a3.5 3.5 0 0 1-5-5l2.5-2.5" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}
