// ── Legal and policy documents ───────────────────────────────────────────
//
// The text on /terms, /privacy and /cancellation, and the documents a
// customer accepts at checkout, come from src/content/legal/*.md and from
// nowhere else. See the README beside them.
//
// NO POLICY TEXT IN THIS PROJECT IS WRITTEN BY A DEVELOPER. A document is
// published only when its header says it has been approved, when, and by
// whom — and until then its page says so and publishes nothing. Legal copy
// a developer improvised is worse than none: it reads as binding, it is
// what a customer will quote back in a dispute, and nobody who can stand
// behind it has read it.
//
// The Markdown here is a deliberately small subset — headings, paragraphs,
// lists, bold, italic, links — parsed into data and rendered as React
// elements, never as HTML. Whatever is pasted into those files can change
// what the page SAYS, but it cannot inject markup into it.
import termsRaw from "../content/legal/terms.md?raw";
import privacyRaw from "../content/legal/privacy.md?raw";
import cancellationRaw from "../content/legal/cancellation.md?raw";

export type LegalSlug = "terms" | "privacy" | "cancellation";

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "a"; href: string; c: Inline[] };

export type Block =
  | { kind: "p"; c: Inline[] }
  | { kind: "h3"; text: string; id: string }
  | { kind: "ul" | "ol"; items: Inline[][] };

export interface Section {
  id: string;
  heading: string;
  blocks: Block[];
}

export interface LegalDoc {
  slug: LegalSlug;
  path: string;
  title: string;
  status: string;
  /** YYYY-MM-DD, or "" */
  lastUpdated: string;
  approvedBy: string;
  intro: Block[];
  sections: Section[];
  /** true only when approved, dated, attributed and non-empty */
  published: boolean;
  /** why it is not published, for the build log and the tests */
  whyNot: string | null;
}

export const LEGAL_PATH: Record<LegalSlug, string> = {
  terms: "/terms",
  privacy: "/privacy",
  cancellation: "/cancellation",
};

// ── parsing ────────────────────────────────────────────────────────────

function header(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^﻿?---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^\s*([A-Za-z]+)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: raw.slice(m[0].length) };
}

/**
 * Only destinations a policy link can reasonably have. Anything else —
 * javascript:, data:, a bare word — is rendered as plain text, so a
 * mistyped or malicious link in pasted copy never becomes a live one.
 */
function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(h) ? h : null;
}

/** **bold**, *italic* or _italic_, and [text](href). Everything else is text. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", c: parseInline(m[1]) });
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      out.push(href ? { t: "a", href, c: parseInline(m[2]) } : { t: "text", v: m[2] });
    } else out.push({ t: "i", c: parseInline(m[4] ?? m[5]) });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

function slugify(s: string, used: Set<string>): string {
  const base = s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

export function parseBody(body: string): { intro: Block[]; sections: Section[] } {
  const intro: Block[] = [];
  const sections: Section[] = [];
  const used = new Set<string>();
  let target = intro;
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: Inline[][] } | null = null;

  const flushPara = () => {
    if (para.length) target.push({ kind: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) target.push(list);
    list = null;
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);

    if (h2 && !h3) {
      flushPara(); flushList();
      const heading = h2[1].trim();
      const s: Section = { id: slugify(heading, used), heading, blocks: [] };
      sections.push(s);
      target = s.blocks;
    } else if (h3) {
      flushPara(); flushList();
      const text = h3[1].trim();
      target.push({ kind: "h3", text, id: slugify(text, used) });
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (!list || list.kind !== kind) { flushList(); list = { kind, items: [] }; }
      list.items.push(parseInline((ul ?? ol)![1]));
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else {
      flushList();
      // A single "#" title line is ignored: the page title comes from the
      // header, and a second H1 would break the heading outline.
      if (!/^#\s/.test(line)) para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return { intro, sections };
}

export function parseDoc(slug: LegalSlug, raw: string): LegalDoc {
  const { meta, body } = header(raw);
  const { intro, sections } = parseBody(body);
  const status = (meta.status ?? "").toLowerCase();
  const lastUpdated = meta.lastUpdated ?? "";
  const approvedBy = meta.approvedBy ?? "";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(lastUpdated) && !Number.isNaN(Date.parse(`${lastUpdated}T00:00:00Z`));

  const whyNot =
    status !== "approved" ? "not marked approved"
    : !validDate ? "no valid lastUpdated date"
    : !approvedBy.trim() ? "no approvedBy — nobody has signed it off"
    : intro.length === 0 && sections.length === 0 ? "no text"
    : null;

  return {
    slug,
    path: LEGAL_PATH[slug],
    title: meta.title || { terms: "Terms of Service", privacy: "Privacy Policy", cancellation: "Cancellation Policy" }[slug],
    status,
    lastUpdated: validDate ? lastUpdated : "",
    approvedBy,
    intro,
    sections,
    published: whyNot === null,
    whyNot,
  };
}

export const LEGAL: Record<LegalSlug, LegalDoc> = {
  terms: parseDoc("terms", termsRaw),
  privacy: parseDoc("privacy", privacyRaw),
  cancellation: parseDoc("cancellation", cancellationRaw),
};

/**
 * Whether checkout should ask the customer to accept the booking terms.
 *
 * Both the Terms of Service and the Cancellation Policy must be published:
 * a customer asked to accept a document that says "being finalised" is not
 * accepting anything, and a checkbox naming one that 404s is worse.
 */
export function bookingTermsReady(docs: Record<LegalSlug, LegalDoc> = LEGAL): boolean {
  return docs.terms.published && docs.cancellation.published;
}
