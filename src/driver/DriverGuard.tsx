// The approval gate.
//
// This is a route guard, not hidden UI: an unapproved driver never gets the
// portal rendered at all, so there is nothing to reveal with devtools. The
// database agrees — claim_ride and set_ride_status both refuse anyone whose
// drivers.status is not 'approved'.
import { useEffect, useState, type ReactNode } from "react";
import { loadDriver, type DriverProfile } from "./lib/driver";

interface GateProps {
  children: (driver: DriverProfile) => ReactNode;
}

type State =
  | { phase: "loading" }
  | { phase: "no-driver" }
  | { phase: "blocked"; driver: DriverProfile }
  | { phase: "ready"; driver: DriverProfile };

export default function DriverGuard({ children }: GateProps) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadDriver().then((driver) => {
      if (cancelled) return;
      if (!driver) setState({ phase: "no-driver" });
      else if (driver.status !== "approved") setState({ phase: "blocked", driver });
      else setState({ phase: "ready", driver });
    });
    return () => { cancelled = true; };
  }, []);

  if (state.phase === "loading") {
    return (
      <div className="drv">
        <div className="drv-gate">
          <span className="lbl">One moment</span>
        </div>
      </div>
    );
  }

  if (state.phase === "no-driver") {
    return (
      <div className="drv">
        <div className="drv-gate">
          <div className="mark">C</div>
          <h1>This is the driver portal.</h1>
          <p>
            Sign in with the account Cabby's set up for you. If you're a traveller
            looking for your trip, it lives under My trips.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "blocked") {
    const suspended = state.driver.status === "suspended";
    return (
      <div className="drv">
        <div className="drv-gate">
          <div className={`mark ${suspended ? "suspended" : "pending"}`}>
            {suspended ? "—" : "·"}
          </div>
          <h1>{suspended ? "Your account is on hold." : "Application received."}</h1>
          <p>
            {suspended
              ? "Please contact Cabby's and we'll pick it up from there."
              : "We're checking your licence and vehicle details."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children(state.driver)}</>;
}
