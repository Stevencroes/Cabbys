/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }

/** The commit this bundle was built from — see buildId() in vite.config.ts. */
declare const __BUILD_ID__: string;
