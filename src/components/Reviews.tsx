// §12 — what guests say, and only what they can be shown to have said.
//
// Renders NOTHING until src/data/reviews.ts holds at least one review that
// passes verifiedOnly(). No heading, no band, no reserved space: the page
// goes straight from the fleet to the FAQ, and globals.css closes that
// seam to a single hairline so it reads as designed rather than as a
// section that went missing.
//
// This band used to carry a "5.0 from 300+ reviews", a quote from
// "Jessica M." and three platform wordmarks, none of which could be
// traced to anything. Every element that remains is one a guest can
// click through and check.
//
// ── Deliberately NOT here: an average ─────────────────────────────────
//
// It would be easy to compute "4.9 from 3 reviews" out of the entries
// below, and it would be a fabricated rating by another route. These are
// reviews chosen to be displayed; an average of a hand-picked set says
// nothing about the rating the platform holds, and printing it as though
// it did is the claim that was just removed. If a platform-wide score is
// ever wanted, it belongs in its own field with its own source link to
// the profile that states it — not derived here.
//
// Layout follows count, not a template: one review is a single centred
// voice in the display face, which is how the band was designed; two or
// three share a row and step the serif down so three columns still read
// as quotations rather than as a wall of type. More than three is a
// carousel's worth, and this page does not have a carousel.
import { VERIFIED_REVIEWS, verifiedOnly, type Review } from "../data/reviews";
import { monthLabel } from "../lib/datetime";

const MAX_SHOWN = 3;

/** One mark per point, filled to the rating. One role="img" carrying the
    whole claim, so a screen reader hears "Rated 4 out of 5" once rather
    than five unlabelled shapes it has to count. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="ps-stars stagger" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={i <= rating ? undefined : "off"}
          width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
        >
          <path d="m10 1.6 2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.6 4.8 17.5 6 11.7 1.6 7.7l5.9-.7Z" />
        </svg>
      ))}
    </span>
  );
}

function ReviewItem({ r }: { r: Review }) {
  return (
    <li>
      <figure className="proof-item">
        <div className="proof-rate rise"><Stars rating={r.rating} /></div>
        <blockquote className="proof-quote rise" cite={r.sourceUrl}>
          <p>&ldquo;{r.text}&rdquo;</p>
        </blockquote>
        <figcaption className="proof-by rise">
          <span className="pb-n">{r.author}</span>
          {/* The link is the evidence, so it is the one thing on the line
              that looks tappable. New tab because it leaves the site
              mid-browse; noopener so the platform's page gets no handle
              on this window. The label says where it goes and that it
              opens a tab — and contains the visible word, so a voice
              user saying "click Google" still lands on it. */}
          <a
            href={r.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Read ${r.author}'s review on ${r.platform} (opens in a new tab)`}
          >
            {r.platform}
          </a>
          <time dateTime={r.date}>{monthLabel(r.date)}</time>
        </figcaption>
      </figure>
    </li>
  );
}

export default function Reviews({
  reviews = VERIFIED_REVIEWS,
  now = Date.now(),
}: {
  /** injectable for tests; the page uses the verified list */
  reviews?: Review[];
  now?: number;
}) {
  const shown = verifiedOnly(reviews, now).slice(0, MAX_SHOWN);
  if (shown.length === 0) return null;

  return (
    <section className="proof" id="reviews" aria-labelledby="proof-h">
      <div className="proof-in">
        <h2 id="proof-h" className="sr-only">What guests say</h2>
        <ul className={`proof-list${shown.length > 1 ? " many" : ""}`}>
          {shown.map((r) => <ReviewItem key={`${r.platform}|${r.sourceUrl}`} r={r} />)}
        </ul>
      </div>
    </section>
  );
}
