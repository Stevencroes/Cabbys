// §12 — social proof. One voice, given the room to be heard.
//
// This was a three-column row inside the footer: the score at one end, the
// quote in the middle, the platform names at the other, fenced above and
// below by hairlines identical in weight to the sitemap's own. Two things
// were wrong with it.
//
// The hierarchy was upside down. "Google Tripadvisor Trustpilot" was set at
// 14px/600 and the testimonial at 14.5px/400 in a dimmer grey, so the
// boldest thing in the row was three wordmarks nobody came to read, and the
// sentence that does the actual persuading was the faintest. The eye landed
// on the logos and left.
//
// And it was in the FOOTER, under the closing button — the last place on a
// page where anyone decides anything. It is a section now, between the
// fleet and the FAQ: after the product, before the objections, which is
// exactly where someone thinks "do other people trust these guys?".
//
// It carries no rules of its own. It sits on --ground between two --deep
// bands, so the change of ground does the separating that four stacked
// hairlines were doing badly. That is the fix for the fencing: not a better
// line, no line.
//
// Still deliberately brief — a rating, one voice, and where that voice is
// public. No cards, no carousel, and no invented second testimonial: every
// claim here is the one that was here before.
const PLATFORMS = ["Google", "Tripadvisor", "Trustpilot"];
const RATING = 5;
const COUNT = "300+";

export default function Reviews() {
  return (
    <section className="proof" id="reviews" aria-labelledby="proof-h">
      <div className="proof-in">
        <h2 id="proof-h" className="sr-only">What guests say</h2>

        {/* The stars are a picture of a number that is written out beside
            them. One role="img" with the whole claim in its label, rather
            than five hidden SVGs and a "5.0" a screen reader has to infer
            is a rating at all. */}
        <div className="proof-rate rise">
          {/* `stagger` puts the five under the reveal observer, which indexes
              them and lets CSS fill them 70ms apart. They are one role="img"
              with the whole claim in its label, so the sequence is decoration
              over a mark that has already been announced as "rated 5 of 5" —
              a screen reader never waits for an animation to learn the score. */}
          <span
            className="ps-stars stagger"
            role="img"
            aria-label={`Rated ${RATING} out of 5, from more than 300 reviews`}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="m10 1.6 2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.6 4.8 17.5 6 11.7 1.6 7.7l5.9-.7Z" />
              </svg>
            ))}
          </span>
          <span className="ps-c" aria-hidden="true">
            <strong>{RATING.toFixed(1)}</strong> from {COUNT} reviews
          </span>
        </div>

        {/* The payload, in the display face. A testimonial set at body size
            is a caption; set in the serif it is the thing the band is for. */}
        <blockquote className="proof-quote rise">
          <p>
            &ldquo;Cabby&rsquo;s made our trip in Aruba effortless. The driver was on time,
            super professional and the car was immaculate.&rdquo;
          </p>
          <cite>Jessica M.</cite>
        </blockquote>

        {/* Where it is public. Deliberately NOT links and deliberately not
            bold: there are no review-profile URLs to point at yet, and a
            wordmark styled like a button that goes nowhere is a promise the
            page cannot keep. Give these real profile URLs and they should
            become anchors — that is the one thing this band is still owed. */}
        <p className="proof-on rise">
          <span className="po-l">Reviewed on</span>
          {PLATFORMS.map((n) => <span key={n} className="po-n">{n}</span>)}
        </p>
      </div>
    </section>
  );
}
