// §12 — social proof, kept deliberately small. A rating, a count, one voice
// and the three places that voice is public. No testimonial cards: the
// section earns trust by being brief about it.
const PLATFORMS = ["Google", "Tripadvisor", "Trustpilot"];

export default function Reviews() {
  return (
    <section className="proof" id="reviews">
      <div className="wrap proof-in">
        <div className="proof-score rise">
          <span className="ps-n">5.0</span>
          <span className="ps-stars" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="m10 1.6 2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.6 4.8 17.5 6 11.7 1.6 7.7l5.9-.7Z" />
              </svg>
            ))}
          </span>
          <span className="ps-c">From 300+ reviews</span>
        </div>

        <blockquote className="proof-quote rise">
          <p>&ldquo;Cabby&rsquo;s made our trip in Aruba effortless. The driver was on time, super professional and the car was immaculate.&rdquo;</p>
          <cite>&mdash; Jessica M.</cite>
        </blockquote>

        <div className="proof-on rise">
          {PLATFORMS.map((n) => <span key={n}>{n}</span>)}
        </div>
      </div>
    </section>
  );
}
