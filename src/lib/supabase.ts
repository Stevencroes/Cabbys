import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
// Named for the key it used to hold. It now carries a PUBLISHABLE key
// (sb_publishable_…): the legacy anon JWT is disabled at the project,
// after one of them leaked and every legacy key had to go with it. Both
// are public by design and belong in the bundle; only the name is
// historical. See .env.example.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// These three are the library defaults, written out rather than assumed:
// the whole session model depends on them. persistSession keeps a signed-in
// traveler signed in across visits, autoRefreshToken stops a long booking
// from expiring mid-payment, and detectSessionInUrl is what turns the
// recovery link's #access_token fragment into a session on /reset-password.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
