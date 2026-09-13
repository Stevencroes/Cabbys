import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Node's own globals are not typed in this project — there is no
 * @types/node, and one string is not worth a dependency. This is the whole
 * surface used here.
 */
declare const process: { env: Record<string, string | undefined> };

/**
 * Which build is this?
 *
 * Every question about the deployed site has started with "is the fix even
 * live yet", and the answer has usually been no. Stamping the commit into
 * the bundle lets the page say so itself rather than anyone inferring it
 * from behaviour.
 *
 * Vercel hands the SHA over in the environment. A local build has no
 * business claiming one, so it says so.
 */
function buildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : "local";
}

/**
 * Where this build believes it lives.
 *
 * index.html carries four absolute URLs — the canonical link, og:url and
 * two image URLs — and they are absolute because they have to be: a
 * crawler resolving og:image itself is a preview nobody can rely on, and
 * WhatsApp link previews are how half this island shares anything.
 *
 * They were hard-coded to cabbys.aw with a TODO asking whoever ships the
 * site to remember. Nobody remembers. Now it is one variable, set on the
 * host, and the fallback is the value that was already there — so a build
 * with nothing set behaves exactly as it did before.
 *
 * Set VITE_SITE_URL in Vercel to the real domain the day it is bought,
 * with no trailing slash.
 */
function siteUrl(): string {
  return (process.env.VITE_SITE_URL || "https://cabbys.aw").replace(/\/+$/, "");
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "cabbys-site-url",
      // NOT %SITE_URL%, which is what this was first written as: Vite's
      // own build-html plugin runs decodeURI over every href and src, and
      // "%SI" is not a valid percent-escape, so the build died with "URI
      // malformed" before this transform was ever reached.
      transformIndexHtml: (html: string) => html.split("__SITE_URL__").join(siteUrl()),
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
});
