// Profile — who you are to us, and the way out.
//
// Status is shown but never editable here: the database refuses a driver
// changing their own status, so offering the control would be a lie.
import { useAuth } from "../../booking/useAuth";
import type { DriverProfile } from "../lib/driver";

export default function Profile({ driver }: { driver: DriverProfile }) {
  const { signOut } = useAuth();

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
          <div className="drv-r"><span className="rl">Phone</span><span className="rv">{driver.phone || "—"}</span></div>
          <div className="drv-r"><span className="rl">Vehicle</span><span className="rv">{driver.vehicle || "—"}</span></div>
          <div className="drv-r"><span className="rl">Plate</span><span className="rv">{driver.plate || "—"}</span></div>
        </div>

        <p className="sub" style={{ fontSize: "11.5px", marginBottom: 16 }}>
          Vehicle and plate are set by Cabby's. Message us to change them.
        </p>

        <button type="button" className="drv-cta ghost" onClick={() => signOut()}>Sign out</button>
      </div>
    </div>
  );
}
