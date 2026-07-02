import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Remember what had focus so we can restore it when the dialog closes.
  const lastFocused = useRef<HTMLElement | null>(null);

  const openAuth = useCallback(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const closeAuth = useCallback(() => setOpen(false), []);

  // Escape to close, lock background scroll, move focus into the dialog, and
  // keep Tab focus trapped within it while open (WCAG 2.4.3 / 2.1.2).
  useEffect(() => {
    if (!open) {
      lastFocused.current?.focus?.();
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first focusable control in the panel.
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAuth();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closeAuth]);

  return (
    <Ctx.Provider value={{ openAuth, closeAuth }}>
      {children}
      {open && (
        <div className="auth-overlay" onClick={closeAuth}>
          <div
            className="auth-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="auth-close" type="button" aria-label="Close" onClick={closeAuth}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>

            <div className="auth-brand" id="auth-modal-title">Cabby's</div>

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
