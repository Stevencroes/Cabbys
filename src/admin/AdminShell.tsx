// The shell: the mark, the eight places to be, and who you are.
//
// A rail down the left, not tabs across the top. The old bar held three
// tabs and read fine; eight would have wrapped to two lines, and a
// navigation that reflows as the window narrows is one an operator stops
// trusting to be in the same place. A vertical list also has room for
// the one thing a horizontal strip could never carry — a count beside
// the two entries that ever need one — without turning into a toolbar.
//
// The counts are the whole argument for loading the board's working set
// in the shell rather than per screen. An operator reading the Drivers
// list has to be able to see that a ride just went unassigned, or the
// board only tells the truth about whichever screen is open.
//
// Below 960px the same markup lays out as a bar: mark, account, and a
// horizontal rail of the eight. Not a hamburger and not a bottom tab
// strip — the driver portal has a thumb rail because it is used in a car
// mount, and this is the owner checking the board from a kerb, which is
// a different thing from an app.
//
// The signed-in address stays visible rather than hiding behind a menu.
// Cabby's has one Supabase project and one identity system, so the same
// person can be a passenger in one tab and the operator here — and "why
// is this board empty" has more than once turned out to be "you're the
// other account".
import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../booking/useAuth";
import type { AuthedUser } from "../driver/lib/driver";
import { useBoard } from "./BoardContext";
import "../styles/admin.css";

/**
 * The eight, and the list is closed.
 *
 * Vehicles is deliberately not among them. A vehicle in this database is
 * six columns on a driver — one car per driver, no identity of its own,
 * no registry a car could outlive its driver in — so a Vehicles screen
 * would have been the Drivers screen with different column headings.
 * The car lives inside the driver's profile, where the operator is
 * already standing when they ask about it. What a real fleet registry
 * would take is written down in the report that came with this work.
 */
const NAV: { to: string; label: string; end?: boolean; count?: "unassigned" | "attention" }[] = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/rides", label: "Ride requests", count: "unassigned" },
  { to: "/admin/schedule", label: "Schedule" },
  { to: "/admin/drivers", label: "Drivers" },
  { to: "/admin/customers", label: "Customers" },
  { to: "/admin/earnings", label: "Earnings" },
  { to: "/admin/support", label: "Support", count: "attention" },
];

interface ShellProps {
  user: AuthedUser;
  children: ReactNode;
}

export default function AdminShell({ user, children }: ShellProps) {
  const { signOut } = useAuth();
  const { unassigned, attention } = useBoard();
  // Only the ones that are happening now. A badge that counts everything
  // worth knowing is a badge that is never zero, and a badge that is
  // never zero is furniture.
  const urgent = attention.filter((a) => a.severity === "now").length;

  const countFor = (key?: "unassigned" | "attention") =>
    key === "unassigned" ? unassigned : key === "attention" ? urgent : 0;

  return (
    <div className="adm">
      <a className="adm-skip" href="#adm-main">Skip to the board</a>
      <div className="adm-frame">
        <header className="adm-rail">
          <div className="adm-railtop">
            <span className="adm-mark">
              Cabby<span className="ap">'</span>s
              <small>Operations</small>
            </span>
          </div>

          <nav className="adm-nav" aria-label="Admin">
            {NAV.map((t) => {
              const n = countFor(t.count);
              return (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "on" : "")}>
                  <span className="lb">{t.label}</span>
                  {/* Absent at zero rather than showing a 0. A count is a
                      claim that something needs doing. */}
                  {n > 0 && (
                    <span className="ct" aria-label={`${n} needing attention`}>{n}</span>
                  )}
                </NavLink>
              );
            })}
            <span className="adm-navgap" aria-hidden="true" />
            <NavLink to="/admin/settings" className={({ isActive }) => (isActive ? "on" : "")}>
              <span className="lb">Settings</span>
            </NavLink>
          </nav>

          <div className="adm-railfoot">
            <span className="em" title={user.email ?? undefined}>{user.email ?? user.id}</span>
            <button type="button" className="adm-quiet" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <main className="adm-screen" id="adm-main">{children}</main>
      </div>
    </div>
  );
}
