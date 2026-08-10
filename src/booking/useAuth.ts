import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

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

  return {
    user,
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
    signUpWithPassword: (email: string, password: string) =>
      supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }),
    signOut: () => supabase.auth.signOut(),
  };
}
