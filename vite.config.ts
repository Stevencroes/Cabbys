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

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
});
