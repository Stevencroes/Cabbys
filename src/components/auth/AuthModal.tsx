import { createContext, useCallback, useContext, useState } from "react";
import { useAuth } from "../../booking/useAuth";
import AuthForm from "./AuthForm";

interface AuthModalCtx {
  openAuth: () => void;
  closeAuth: () => void;
}

const Ctx = createContext<AuthModalCtx>({ openAuth: () => {}, closeAuth: () => {} });

/** Open / close the global sign-in modal from anywhere (e.g. the Nav). */
export function useAuthModal() {
  return useContext(Ctx);
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();

  const openAuth = useCallback(() => setOpen(true), []);
  const closeAuth = useCallback(() => setOpen(false), []);

  return (
    <Ctx.Provider value={{ openAuth, closeAuth }}>
      {children}
      {open && (
        <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Sign in" onClick={closeAuth}>
          <div className="auth-panel" onClick={(e) => e.stopPropagation()}>
            <button className="auth-close" type="button" aria-label="Close" onClick={closeAuth}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>

            <div className="auth-brand">Cabby's</div>

            {user ? (
              <div style={{ textAlign: "center" }}>
                <p className="acct-note" style={{ marginTop: 0 }}>
                  Signed in as <strong>{user.email}</strong>
                </p>
                <button
                  className="btn-ghost"
                  type="button"
                  style={{ marginTop: "8px" }}
                  onClick={async () => {
                    await signOut();
                    closeAuth();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <p className="auth-sub">Sign in to view your trips and book faster — same account as the Cabby's app.</p>
                <AuthForm heading="Welcome back" onSuccess={closeAuth} />
              </>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
