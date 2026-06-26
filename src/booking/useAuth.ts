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
    signInWithProvider: (provider: "google" | "apple") =>
      supabase.auth.signInWithOAuth({ provider, options: { redirectTo } }),
    signInWithEmail: (email: string) =>
      supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }),
    signOut: () => supabase.auth.signOut(),
  };
}
