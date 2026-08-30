// ── On-page map diagnostics ──────────────────────────────────────────
// Shared by whichever map provider is wired in — the questions "did the
// map load" and "what happened when it didn't" don't belong to Mapbox or
// Google specifically, they belong to the map. This file used to be named
// after the provider it was written against (mapbox.ts); the provider
// changed, this didn't.

/**
 * The same reason a map gave up, but on the page instead of only the
 * console.
 *
 * The console is the right place for this until the console is not
 * available: a phone has no dev tools, and on a desktop the site's own
 * warning can sit under a hundred lines from a wallet extension. Adding
 * ?mapdebug=1 to the URL puts the reason in the map's own caption, where
 * whoever is fixing it is already looking.
 *
 * A query flag rather than a build flag, so a live site can be asked the
 * question without a redeploy — and so its absence also answers a
 * question: if the flag does nothing, the build predates this code.
 */
export function mapDebugOn(): boolean {
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).has("mapdebug");
}

/**
 * A running account of what the map did.
 *
 * "It renders and then disappears" is a sequence, and a single reason
 * string cannot describe a sequence. This keeps the ordered list — created,
 * loaded, errored, torn down — so the page can show what happened rather
 * than only what went wrong last.
 */
const trace: string[] = [];
const traceListeners = new Set<() => void>();

export function traceMap(event: string): void {
  const at = typeof performance !== "undefined" ? Math.round(performance.now()) : 0;
  trace.push(`${String(at).padStart(5)}ms ${event}`);
  // long enough for a whole life cycle, short enough to read on a phone
  if (trace.length > 14) trace.shift();
  traceListeners.forEach((fn) => fn());
}

export function mapTrace(): string[] {
  return trace;
}

export function onMapTrace(fn: () => void): () => void {
  traceListeners.add(fn);
  return () => { traceListeners.delete(fn); };
}

/** What the bundle knows about itself, for the debug panel. `keyLine` is
    supplied by whichever provider module is active, so this file never
    needs to know what a Google or Mapbox key looks like. */
export function buildLine(keyLine: string): string {
  const id = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown";
  return `build ${id} · ${keyLine}`;
}
