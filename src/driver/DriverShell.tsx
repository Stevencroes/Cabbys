// The shell: the mark and the online switch never move, because whether
// you are taking work is the one thing that must be true at a glance from
// a car mount. Everything else scrolls beneath.
import { useCallback, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { setOnline, type DriverProfile } from "./lib/driver";
import "../styles/driver.css";

const TABS = [
  { to: "/drive", label: "Today", end: true },
  { to: "/drive/pool", label: "Pool", end: false },
  { to: "/drive/earnings", label: "Earnings", end: false },
  { to: "/drive/history", label: "History", end: false },
  { to: "/drive/profile", label: "Profile", end: false },
];

interface ShellProps {
  driver: DriverProfile;
  children: ReactNode;
  /** the ride detail owns the whole screen — no nav, no top bar */
  bare?: boolean;
}

export default function DriverShell({ driver, children, bare }: ShellProps) {
  const [online, setOnlineState] = useState(driver.isOnline);

  const toggle = useCallback(() => {
    const next = !online;
    setOnlineState(next);   // optimistic — the switch must feel instant
    void setOnline(next);
  }, [online]);

  return (
    <div className="drv">
      {!bare && (
        <div className="drv-top">
          <span className="drv-mark">
            Cabby<span className="ap">'</span>s
            <small>Driver</small>
          </span>
          <div className="drv-onoff">
            <span className={`st${online ? " on" : ""}`}>{online ? "Online" : "Offline"}</span>
            <button
              type="button"
              className={`drv-tgl${online ? " on" : ""}`}
              onClick={toggle}
              role="switch"
              aria-checked={online}
              aria-label={online ? "Go offline" : "Go online"}
            />
          </div>
        </div>
      )}

      <div className="drv-screen">{children}</div>

      {!bare && (
        <nav className="drv-nav" aria-label="Driver">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "on" : "")}>
              <span className="dot" aria-hidden="true" />
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
