// The shell: the mark, who you are signed in as, and three tabs.
//
// Three, because there are three jobs — see the note in AdminPortal. The
// tabs sit at the TOP rather than in a thumb rail at the foot: the
// driver portal's bottom nav is furniture for a phone in a car mount,
// and this board is read at a desk with a wheel, where navigation
// belongs where the eye starts.
//
// The signed-in address is on the bar and not tucked behind a menu on
// purpose. Cabby's has one Supabase project and one identity system, so
// the same person can be signed in as a passenger in one tab and as the
// operator here — and "why is this board empty" has, more than once in
// this codebase's history, turned out to be "you're the other account".
import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../booking/useAuth";
import type { AuthedUser } from "../driver/lib/driver";
import "../styles/admin.css";

const TABS = [
  { to: "/admin", label: "Drivers", end: true },
  { to: "/admin/rides", label: "Rides", end: false },
  { to: "/admin/assign", label: "Assign", end: false },
];

interface ShellProps {
  user: AuthedUser;
  children: ReactNode;
}

export default function AdminShell({ user, children }: ShellProps) {
  const { signOut } = useAuth();

  return (
    <div className="adm">
      <div className="adm-top">
        <div className="in">
          <span className="adm-mark">
            Cabby<span className="ap">'</span>s
            <small>Admin</small>
          </span>
          <div className="adm-who">
            <span className="em" title={user.email ?? undefined}>{user.email ?? user.id}</span>
            <button type="button" className="adm-quiet" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>

      <nav className="adm-tabs" aria-label="Admin">
        <div className="in">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "on" : "")}>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="adm-screen">{children}</div>
    </div>
  );
}
