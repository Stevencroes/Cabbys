// The operator gate.
//
// A route guard, not hidden UI: a non-admin never gets the board
// rendered, so there is nothing to reveal with devtools — and the
// database agrees, because admin_set_driver_status and admin_assign_ride
// both open with `if not public.is_admin()`. This screen decides what
// somebody is SHOWN; docs/admin-schema.sql decides what they can DO, and
// it does not trust this file.
//
// Operators sign in with the same accounts as passengers and drivers —
// one Supabase project, one identity system. What decides whether they
// get the board is not a separate login but whether their account has a
// row in `admins`. Four ways that can fail, and they are four different
// problems with four different fixes:
//
//   · not signed in            → sign in
//   · signed in, not an admin  → somebody has to grant it, and THIS
//                                screen carries the statement that does
//   · the check itself failed  → the migration hasn't been run, or the
//                                project is unreachable. NOT "not an
//                                admin": reporting a failed query as a
//                                negative answer is the fault DriverGuard
//                                was rebuilt around, and it would land
//                                here on the owner of the company, who
//                                would go hunting a permission problem
//                                that does not exist instead of running
//                                docs/admin-schema.sql.
//   · signed in and an admin   → the board
//
// The third one is the reason this file is not six lines long.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import AuthForm from "../components/auth/AuthForm";
import { useAuth } from "../booking/useAuth";
import { supabase } from "../lib/supabase";
import { getAuthedUser, type AuthedUser } from "../driver/lib/driver";
import { checkIsAdmin } from "./lib/admin";
import "../styles/admin.css";

interface GateProps {
  children: (user: AuthedUser) => ReactNode;
}

type State =
  | { phase: "loading" }
  | { phase: "signed-out" }
  | { phase: "no-admin"; user: AuthedUser }
  | { phase: "unreachable"; user: AuthedUser; detail: string }
  | { phase: "ready"; user: AuthedUser };

export default function AdminGuard({ children }: GateProps) {
  const [state, setState] = useState<State>({ phase: "loading" });
  /** a re-check the operator asked for, so the button can say it is working */
  const [checking, setChecking] = useState(false);
  const live = useRef(true);
  const { signOut } = useAuth();

  const refresh = useCallback(async () => {
    const user = await getAuthedUser();
    if (!live.current) return;
    if (!user) { setState({ phase: "signed-out" }); return; }
    const { isAdmin, error } = await checkIsAdmin();
    if (!live.current) return;
    if (error) { setState({ phase: "unreachable", user, detail: error }); return; }
    if (!isAdmin) { setState({ phase: "no-admin", user }); return; }
    setState({ phase: "ready", user });
  }, []);

  /** the same check, with a word that it is happening */
  const check = useCallback(async () => {
    setChecking(true);
    await refresh();
    if (live.current) setChecking(false);
  }, [refresh]);

  useEffect(() => {
    live.current = true;
    void refresh();
    // Sign-in and sign-out both land here without a page reload — a
    // password sign-in resolves in place, and Google OAuth returns via
    // /auth/callback?next=/admin (see useAuth.signInWithProvider).
    const { data } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => {
      live.current = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  if (state.phase === "ready") return <>{children(state.user)}</>;

  if (state.phase === "loading") {
    return (
      <Gate>
        <Wordmark />
        <p className="adm-hold">One moment.</p>
      </Gate>
    );
  }

  if (state.phase === "signed-out") {
    return (
      <Gate>
        <Wordmark />
        <h1>This is the Cabby's board.</h1>
        <p>Sign in with the account that runs Cabby's.</p>
        <div className="adm-auth-wrap">
          <AuthForm heading="Admin sign-in" oauthNext="/admin" onSuccess={() => void refresh()} allowSignUp={false} />
        </div>
      </Gate>
    );
  }

  if (state.phase === "unreachable") {
    return (
      <Gate>
        <Mark tone="alert"><Broken /></Mark>
        <h1>Can't check who you are.</h1>
        <p>
          This isn't a "no". The board asked the database whether this account is an
          admin and the question itself failed, so it doesn't know either way — which
          usually means docs/admin-schema.sql hasn't been run on this project yet.
        </p>
        <Diag user={state.user} />
        {/* Not for the operator. This is the line whoever fixes it needs,
            and it says where the fix lives — which is not on this screen. */}
        <p className="adm-why">
          {state.detail}
          <br />Run docs/admin-schema.sql in the Supabase SQL editor, then try again.
        </p>
        <Actions checking={checking} onCheck={check} onSignOut={signOut} checkLabel="Try again" />
      </Gate>
    );
  }

  // Signed in, read fine, and genuinely not an admin.
  //
  // The whole point of this portal is that nobody should be typing SQL at
  // the production database. The bootstrap is the one exception that
  // cannot be removed — a signed-out browser cannot be trusted to
  // nominate the first operator — so the least this screen can do is
  // hand over the statement with the uid already in it, rather than
  // printing a UUID and leaving somebody to assemble the insert by hand
  // against a table they have never seen.
  return (
    <Gate>
      <Mark><Key /></Mark>
      <h1>This account isn't an admin.</h1>
      <p>
        You're signed in and the admin list was read fine — this account just isn't
        on it. Whoever runs Cabby's can add you by running the line below in the
        Supabase SQL editor.
      </p>
      <Diag user={state.user} />
      <code className="adm-sql">
        insert into public.admins (user_id) values ('{state.user.id}') on conflict do nothing;
      </code>
      <Actions checking={checking} onCheck={check} onSignOut={signOut} checkLabel="Check again" />
    </Gate>
  );
}

/** Every gate is the same frame — one mark, one sentence, one way forward. */
function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="adm">
      <div className="adm-gate">{children}</div>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="adm-mark gate">
      Cabby<span className="ap">'</span>s
      <small>Admin</small>
    </span>
  );
}

function Mark({ children, tone }: { children: ReactNode; tone?: "alert" }) {
  return <div className={`gi${tone === "alert" ? " stop" : ""}`} aria-hidden="true">{children}</div>;
}

/** Which account this is. On the not-an-admin gate the uid is not
    diagnostics — it is the value that goes into the insert above. */
function Diag({ user }: { user: AuthedUser }) {
  return (
    <div className="adm-diag">
      <div className="row"><span className="k">Signed in as</span><span className="v">{user.email ?? "—"}</span></div>
      <div className="row"><span className="k">Account ID</span><span className="v mono">{user.id}</span></div>
    </div>
  );
}

/**
 * Two moves, and neither of them is "sign out".
 *
 * The grant lands on Cabby's side while this screen is open, exactly the
 * way driver approval does — and the driver gate learned the hard way
 * that without a re-check the only way to see it land is to sign out and
 * back in.
 */
function Actions({ checking, onCheck, onSignOut, checkLabel }: {
  checking: boolean; onCheck: () => void; onSignOut: () => void; checkLabel: string;
}) {
  return (
    <div className="adm-gateacts">
      <button type="button" className="adm-btn" onClick={onCheck} disabled={checking}>
        {checking ? "Checking…" : checkLabel}
      </button>
      <button type="button" className="adm-quiet" onClick={onSignOut}>Sign out</button>
    </div>
  );
}

/* Drawn, not typed — the same reason the driver gate's marks are drawn:
   an emoji is the one thing in a monochrome system guaranteed to arrive
   in somebody else's colours. */
function Key() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8.5" cy="11" r="4" />
      <path d="M12.2 12.6L20 20.4M17.2 17.4l-2 2M19.4 15.2l-2 2" strokeLinecap="round" />
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
