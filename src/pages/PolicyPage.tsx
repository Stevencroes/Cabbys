// ── /terms, /privacy, /cancellation ──────────────────────────────────────
//
// One template for all three, fed only by src/content/legal/*.md through
// src/lib/legal.ts. The page adds structure and nothing else: a title, the
// date it was last updated, a table of contents on anything long enough to
// need one, and the approved text set to be read rather than skimmed —
// body type at 16px or more, a generous line height, and a measure capped
// so a line of legal prose never runs the width of a desktop screen.
//
// While a document is not approved it publishes NOTHING in its place. The
// page says the policy is being finalised and how to reach Cabby's, and
// that is all: a developer's placeholder terms would read as binding to
// the one customer who needs them to be accurate.
import { Fragment, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { useAuthModal } from "../components/auth/AuthModal";
import { LEGAL, type Block, type Inline, type LegalDoc, type LegalSlug } from "../lib/legal";
import { MONTHS_LONG } from "../lib/datetime";
import { SUPPORT_EMAIL, askAnything } from "../lib/support";
import { whatsappLink } from "../lib/whatsapp";

/** A table of contents earns its space from the third section on. */
const TOC_FROM = 3;

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

function InlineText({ c }: { c: Inline[] }): ReactNode {
  return c.map((n, i) => {
    if (n.t === "text") return <Fragment key={i}>{n.v}</Fragment>;
    if (n.t === "b") return <strong key={i}><InlineText c={n.c} /></strong>;
    if (n.t === "i") return <em key={i}><InlineText c={n.c} /></em>;
    const external = /^https?:\/\//i.test(n.href);
    return external ? (
      <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
        <InlineText c={n.c} /><span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <a key={i} href={n.href}><InlineText c={n.c} /></a>
    );
  });
}

function BlockView({ b }: { b: Block }) {
  if (b.kind === "p") return <p><InlineText c={b.c} /></p>;
  if (b.kind === "h3") return <h3 id={b.id}>{b.text}</h3>;
  const List = b.kind === "ul" ? "ul" : "ol";
  return <List>{b.items.map((it, i) => <li key={i}><InlineText c={it} /></li>)}</List>;
}

const OTHERS: Record<LegalSlug, LegalSlug[]> = {
  terms: ["cancellation", "privacy"],
  privacy: ["terms", "cancellation"],
  cancellation: ["terms", "privacy"],
};

export default function PolicyPage({ slug, doc = LEGAL[slug] }: { slug: LegalSlug; doc?: LegalDoc }) {
  const { openAuth } = useAuthModal();
  const { hash } = useLocation();
  const wa = whatsappLink(askAnything());

  // A client-side move from one policy to another keeps the old scroll
  // position, so the next document would open at its bottom. Start at the
  // top — unless the link named a section, which HashScroll takes to.
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [slug, hash]);

  // The tab title is the first thing a screen reader announces on arrival,
  // and "Cabby's" alone on three different documents says nothing.
  useEffect(() => {
    const before = document.title;
    document.title = `${doc.title} · Cabby's`;
    return () => { document.title = before; };
  }, [doc.title]);

  const toc = doc.published && doc.sections.length >= TOC_FROM;

  return (
    <>
      <Nav onSignIn={openAuth} />
      <main className="lg-main">
        <div className="wrap lg-wrap">
          <header className="lg-head">
            <p className="lg-kick">Cabby&rsquo;s · Policies</p>
            <h1 id="lg-top" className="lg-title" tabIndex={-1}>{doc.title}</h1>
            {doc.published && (
              <p className="lg-updated">
                Last updated <time dateTime={doc.lastUpdated}>{longDate(doc.lastUpdated)}</time>
              </p>
            )}
          </header>

          {doc.published ? (
            <div className={`lg-layout${toc ? " has-toc" : ""}`}>
              {toc && (
                <nav className="lg-toc" aria-labelledby="lg-toc-h">
                  <h2 id="lg-toc-h" className="lg-toc-h">On this page</h2>
                  <ol>
                    {doc.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.heading}</a></li>)}
                  </ol>
                </nav>
              )}
              <article className="lg-body" aria-labelledby="lg-top">
                {doc.intro.map((b, i) => <BlockView key={`i${i}`} b={b} />)}
                {doc.sections.map((s) => (
                  <section key={s.id} aria-labelledby={s.id}>
                    {/* tabIndex -1 so a table-of-contents jump moves focus
                        here too, not only the scroll position — otherwise a
                        keyboard user's next Tab starts back at the top. */}
                    <h2 id={s.id} tabIndex={-1}>{s.heading}</h2>
                    {s.blocks.map((b, i) => <BlockView key={i} b={b} />)}
                  </section>
                ))}
                {toc && <p className="lg-back"><a href="#lg-top">Back to top</a></p>}
              </article>
            </div>
          ) : (
            <div className="lg-pending">
              <p className="lg-lead">This policy is being finalised.</p>
              <p>
                It will be published here once it has been approved. If you have a question
                about it in the meantime, contact us and a person will answer.
              </p>
              <p className="lg-contact">
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                {wa && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          <nav className="lg-others" aria-label="Other policies">
            {OTHERS[slug].map((o) => <Link key={o} to={LEGAL[o].path}>{LEGAL[o].title}</Link>)}
          </nav>
        </div>
      </main>
      <Footer />
    </>
  );
}
