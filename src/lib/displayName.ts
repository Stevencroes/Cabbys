import type { User } from "@supabase/supabase-js";

/** Anything that carries the bits of a Supabase user we read here. */
type NamedUser = Pick<User, "email"> & { user_metadata?: Record<string, unknown> | null };

/**
 * The name the account actually carries, or "" when it carries none.
 * Google hands back `full_name` and `name`; our own sign-up writes
 * `full_name`. Accounts made before the sign-up form asked have neither.
 */
export function fullNameOf(user: NamedUser | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  const raw = meta.full_name ?? meta.name ?? "";
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

/** Title-cases one word, leaving inner digits and casing like m4rk alone. */
function titleWord(w: string): string {
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "";
}

/**
 * A name to put in front of someone, derived from the address when the
 * account has nothing better. `jan.de-vries+trips@x.com` reads back as
 * "Jan De Vries". It is a guess, so it is only ever the fallback.
 */
export function nameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0].split("+")[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => titleWord(w.replace(/\d+$/, "") || w))
    .join(" ")
    .trim();
}

/** What the nav calls you. Never blank, never the whole email address. */
export function displayNameOf(user: NamedUser | null | undefined): string {
  return fullNameOf(user) || nameFromEmail(user?.email) || "Account";
}

/**
 * The letters on the avatar. Two words give two letters, one gives one —
 * a dot rather than a blank, so the circle is never empty.
 */
export function initialsOf(user: NamedUser | null | undefined): string {
  const words = displayNameOf(user).split(" ").filter(Boolean);
  if (!words.length) return "·";
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0];
  return letters.toUpperCase();
}
