// The app shell: cocoa ground, grain, and a bottom nav within thumb reach.
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import "../styles/driver.css";

const TABS = [
  { to: "/drive", label: "Today", end: true },
  { to: "/drive/jobs", label: "Jobs", end: false },
  { to: "/drive/earnings", label: "Earnings", end: false },
  { to: "/drive/profile", label: "Profile", end: false },
];

export default function DriverShell({ children }: { children: ReactNode }) {
  return (
    <div className="drv">
      <main className="drv-main">{children}</main>
      <nav className="drv-nav" aria-label="Driver">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "on" : "")}>
            <span className="dot" aria-hidden="true" />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
