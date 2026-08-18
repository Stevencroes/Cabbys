import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

/** Supabase's own floor is 6. We ask for 8, and check before submitting. */
export const PASSWORD_MIN = 8;

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Supabase writes its errors for developers. These are written for someone
 * standing in an arrivals hall with one bar of signal.
 *
 * Sign-in failures deliberately collapse to a single sentence. Saying "no
 * account with that email" tells a stranger which of our customers' email
 * addresses are real, so the message never names the field that was wrong.
 */
export function authMessage(err: ErrorLike): string {
  const code = err.code ?? "";
  const m = (err.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || m.includes("invalid login credentials"))
    return "Email or password is incorrect.";
  if (isAlreadyRegistered(err)) return "That email already has an account.";
  if (code === "email_not_confirmed" || m.includes("email not confirmed"))
    return "That email hasn't been confirmed yet — check your inbox.";
  if (code === "weak_password" || m.includes("password should be"))
    return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (code === "validation_failed" || m.includes("unable to validate email"))
    return "That doesn't look like an email address.";
  if (err.status === 429 || m.includes("rate limit"))
    return "Too many attempts just now. Wait a minute and try again.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "No connection. Check your signal and try again.";
  return "Something went wrong. Try again.";
}

/** True when the error means the email is already taken. */
export function isAlreadyRegistered(err: ErrorLike): boolean {
  return err.code === "user_already_exists" || /already registered|already exists/i.test(err.message ?? "");
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const redirectTo = `${window.location.origin}/auth/callback`;

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    const res = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    // With confirmations ON, Supabase hides "already registered" behind a
    // decoy user carrying no identities rather than returning an error.
    // Surface it as the error it is, so the form can offer sign-in instead.
    if (!res.error && res.data.user && (res.data.user.identities?.length ?? 1) === 0) {
      return { ...res, error: { message: "User already registered", code: "user_already_exists" } as never };
    }
    return res;
  }, [redirectTo]);

  return {
    user,
    /**
     * A real account. Guests who book without signing in get an ANONYMOUS
     * Supabase user so their insert has an auth.uid() for RLS — that session
     * is a receipt, not an identity, and must never unlock account screens.
     */
    account: user && !user.is_anonymous ? user : null,
    loading,
    // `next` survives the redirect round-trip as a query param — needed
    // because OAuth leaves the page. Callers outside the passenger flow
    // (the driver portal) use it to land back where they started.
    signInWithProvider: (provider: "google" | "apple", next?: string) =>
      supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: next ? `${redirectTo}?next=${encodeURIComponent(next)}` : redirectTo },
      }),
    signInWithEmail: (email: string) =>
      supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }),
    signInWithPassword: (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUpWithPassword,
    /** Sends the recovery mail. Needs working SMTP — see docs/schema.sql §6. */
    resetPassword: (email: string) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    updatePassword: (password: string) => supabase.auth.updateUser({ password }),
    signOut: () => supabase.auth.signOut(),
  };
}
