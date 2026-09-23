// ── Guest reviews — verified ones only ──────────────────────────────────
//
// This list is EMPTY ON PURPOSE, and while it is empty the review band is
// not rendered at all.
//
// What stood here before was a "5.0 from 300+ reviews", a named customer
// quote and "Reviewed on Google · Tripadvisor · Trustpilot" — none of it
// sourced, none of it linkable, on a business that had not yet taken a
// booking. Invented social proof is not a placeholder. To a guest it is a
// claim about the company, and the first one who goes looking for those
// three hundred reviews finds that the most prominent promise on the page
// was made up. For a service whose entire pitch is "the price cannot
// move and the car will be there", that is the worst possible thing to be
// caught inventing.
//
// ── Adding a review ─────────────────────────────────────────────────────
//
// Append an object to VERIFIED_REVIEWS. Nothing else changes: the band
// appears as soon as one entry passes verifiedOnly(), one review renders
// as a single centred voice, two or three as a row.
//
// Every field is required, and each one is there so the claim can be
// checked by the person reading it:
//
//   text       the review as the guest wrote it. Quote it, do not tidy
//              it — an edited quotation is a different quotation.
//   author     the name as the platform shows it, or initials if that is
//              all the guest made public. Never a surname they did not.
//   rating     a whole number 1–5, as the platform recorded it.
//   platform   where it was left.
//   sourceUrl  a link to THAT review (or the guest's review on the
//              profile), https, on that platform's own domain. This is
//              the field that makes it verifiable rather than asserted.
//   date       the day it was posted, YYYY-MM-DD.
//
// An entry missing any of that is dropped rather than shown, and a
// warning names it in development. src/data/reviews.test.ts also fails
// the build if a shipped entry would be dropped, so a typo cannot quietly
// make a real review disappear.

export type ReviewPlatform = "Google" | "Tripadvisor" | "Trustpilot";

export interface Review {
  text: string;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  platform: ReviewPlatform;
  sourceUrl: string;
  /** YYYY-MM-DD, the day it was posted */
  date: string;
}

export const VERIFIED_REVIEWS: Review[] = [];

/**
 * Hosts a review link may live on, per platform.
 *
 * Checked because the link is the verification: a Tripadvisor review
 * pointing at a Google URL is a data-entry mistake, and a link to a
 * domain the platform does not own is not evidence of anything. Google
 * is the loose one on purpose — its share links come from maps.app.goo.gl
 * and g.page as often as from google.com.
 */
const HOSTS: Record<ReviewPlatform, (host: string) => boolean> = {
  Google: (h) =>
    /(^|\.)google\.[a-z.]+$/.test(h) || h === "maps.app.goo.gl" || h === "goo.gl" || h === "g.page",
  Tripadvisor: (h) => /(^|\.)tripadvisor\.[a-z.]+$/.test(h),
  Trustpilot: (h) => /(^|\.)trustpilot\.com$/.test(h),
};

/** Why an entry would not be shown, or null when it can be. */
export function whyNotShown(r: Review, now: number = Date.now()): string | null {
  if (!r.text?.trim()) return "no text";
  if (!r.author?.trim()) return "no author";
  if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) return "rating is not a whole number 1–5";
  if (!(r.platform in HOSTS)) return "unknown platform";

  let url: URL;
  try { url = new URL(r.sourceUrl); } catch { return "sourceUrl is not a URL"; }
  if (url.protocol !== "https:") return "sourceUrl is not https";
  if (!HOSTS[r.platform](url.hostname.toLowerCase())) return `sourceUrl is not on ${r.platform}`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "")) return "date is not YYYY-MM-DD";
  const posted = Date.parse(`${r.date}T00:00:00Z`);
  if (Number.isNaN(posted)) return "date is not a real day";
  // A day's grace, so a review posted this evening in Aruba is not
  // rejected by a server that has already reached tomorrow in UTC.
  if (posted > now + 86_400_000) return "date is in the future";

  return null;
}

/**
 * The entries that can be shown, newest first.
 *
 * Dropping rather than throwing: one bad entry must not take the landing
 * page down with it. But dropping silently is how a real review vanishes
 * and nobody knows why, so development gets told which one and why.
 */
export function verifiedOnly(reviews: Review[], now: number = Date.now()): Review[] {
  const ok: Review[] = [];
  for (const r of reviews) {
    const why = whyNotShown(r, now);
    if (why === null) ok.push(r);
    else if (import.meta.env.DEV) console.warn(`[reviews] not shown (${why}):`, r);
  }
  return ok.sort((a, b) => b.date.localeCompare(a.date));
}
