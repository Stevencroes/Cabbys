import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// These three are the library defaults, written out rather than assumed:
// the whole session model depends on them. persistSession keeps a signed-in
// traveler signed in across visits, autoRefreshToken stops a long booking
// from expiring mid-payment, and detectSessionInUrl is what turns the
// recovery link's #access_token fragment into a session on /reset-password.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
