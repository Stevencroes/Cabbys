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
// but not yet approved" and "approved" are four different problems with
// four different fixes, so they get four different screens.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import AuthForm from "../components/auth/AuthForm";
import { useAuth } from "../booking/useAuth";
import { supabase } from "../lib/supabase";
import { getAuthedUser, loadDriverById, type AuthedUser, type DriverProfile } from "./lib/driver";

interface GateProps {
  children: (driver: DriverProfile) => ReactNode;
}

type State =
  | { phase: "loading" }
  | { phase: "signed-out" }
  | { phase: "no-driver"; user: AuthedUser }
  | { phase: "blocked"; driver: DriverProfile }
  | { phase: "ready"; driver: DriverProfile };

export default function DriverGuard({ children }: GateProps) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const { signOut } = useAuth();

  const refresh = useCallback(async () => {
    const user = await getAuthedUser();
    if (!user) { setState({ phase: "signed-out" }); return; }
    const driver = await loadDriverById(user.id);
    if (!driver) { setState({ phase: "no-driver", user }); return; }
    if (driver.status !== "approved") { setState({ phase: "blocked", driver }); return; }
    setState({ phase: "ready", driver });
  }, []);

  useEffect(() => {
    refresh();
    // Sign-in and sign-out both land here without a page reload — a
    // password sign-in resolves in place, and Google OAuth returns via
    // /auth/callback?next=/drive (see useAuth.signInWithProvider).
    const { data } = supabase.auth.onAuthStateChange(() => { refresh(); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  if (state.phase === "loading") {
    return (
      <div className="drv">
        <div className="drv-gate">
          <p>One moment.</p>
        </div>
      </div>
    );
  }

  if (state.phase === "signed-out") {
    return (
      <div className="drv">
        <div className="drv-gate">
          <div className="gi mark">C</div>
          <h1>This is the driver portal.</h1>
          <p>Sign in with the account Cabby's set up for you.</p>
          <div className="drv-auth-wrap">
            <AuthForm heading="Driver sign-in" oauthNext="/drive" onSuccess={refresh} />
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "no-driver") {
    return (
      <div className="drv">
        <div className="drv-gate">
          <div className="gi">?</div>
          <h1>No driver profile for this account.</h1>
          <p>
            You're signed in, but we can't find a driver record to match. If Cabby's
            just set your account up, this can take a minute — otherwise the details
            below will help us find the mismatch.
          </p>
          <div className="drv-diag">
            <div className="row"><span className="k">Signed in as</span><span className="v">{state.user.email ?? "—"}</span></div>
            <div className="row"><span className="k">Account ID</span><span className="v mono">{state.user.id}</span></div>
          </div>
          <button type="button" className="drv-cta ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "blocked") {
    const suspended = state.driver.status === "suspended";
    return (
      <div className="drv">
        <div className="drv-gate">
          <div className={`gi${suspended ? " stop" : ""}`} aria-hidden="true">
            {suspended ? "—" : "⏳"}
          </div>
          <h1>{suspended ? "Your account is on hold." : "Application received."}</h1>
          <p>
            {suspended
              ? "Please contact Cabby's and we'll pick it up from there."
              : "We're checking your licence and vehicle details. You'll get a message the moment you're approved — usually within a day."}
          </p>
          <button type="button" className="drv-cta ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children(state.driver)}</>;
}
