# Cabby's Web Booking App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Vite + React + TypeScript tourist booking webapp (`Cabbys-web/`) that ports the validated `cabbys-web-preview.html` prototype 1:1, wired to the existing Supabase project for real fares, auth, and booking writes.

**Architecture:** A single-page React app with React Router (`/`, `/trips`, `/auth/callback`). A landing page hosts a booking-entry card that opens an 8-step booking overlay driven by a `BookingContext` state machine. Pure logic (fare engine, currency, capacity, booking payload) lives in tested `lib/` modules; Supabase is the only backend (same project as mobile). Bookings are rows in `public.rides`; pricing comes from the `pricing_*` tables.

**Tech Stack:** React 18, Vite 5, TypeScript, React Router 6, `@supabase/supabase-js` 2, Vitest + React Testing Library, Stripe.js (dormant). Deploy: Vercel.

## Global Constraints

- **Brand colors — the ONLY six permitted:** midnight `#0A1628`, ocean `#142238`, steel `#2A4A72`, silver `#B4C3DC`, mist `#EEF2F8`, white `#FFFFFF` (plus rgba tints derived from these and `silver-dim #7E94B4`). **No gold `#C9A05A`** anywhere.
- **Fonts:** Cormorant Garamond (300, 400) for display/headings/prices; Outfit (300, 400, 500, 600) for UI/body. Import: `family=Cormorant+Garamond:wght@300;400;500&family=Outfit:wght@300;400;500;600`.
- **Voice:** quiet luxury. No exclamation points. No urgency/ride-share language. Tagline "Arrive in silence." Use prototype copy verbatim.
- **Supabase:** same project via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. **Never** create or alter schema or RLS. Bookings → `public.rides`. Pricing → `pricing_zones|locations|routes|addons|config`.
- **Currency:** base AWG (florin). `RATES = { AWG:1, USD:1/1.79, EUR:1/1.97 }`, `SYMBOL = { AWG:'ƒ', USD:'$', EUR:'€' }`. Quote total is **tax-inclusive** (6% government & facility tax shown as its own line).
- **Canonical source files (read-only references):**
  - Prototype markup/style/copy: `../Others/cabbys-web-preview.html`
  - Fare engine to port: `../Others/src/pricing.js`
  - Booking insert shape: `../Others/src/App.jsx` (~line 2024)
- **TDD:** logic modules get real Vitest tests first. UI components get a render smoke test. Commit after every task.

---

## File Structure

```
Cabbys-web/
  index.html                      # fonts + #root
  package.json  vite.config.ts  tsconfig.json  tsconfig.node.json
  vitest.config.ts  vercel.json  .env  .env.example
  api/create-payment-intent.ts    # dormant Vercel function
  src/
    main.tsx  App.tsx  vite-env.d.ts  setupTests.ts
    styles/tokens.css  styles/globals.css
    lib/supabase.ts  lib/pricing.ts  lib/currency.ts  lib/stripe.ts
    lib/bookingPayload.ts
    data/hotels.ts  data/journeys.ts  data/vehicles.ts
    booking/BookingContext.tsx  booking/useFare.ts
    components/Nav.tsx  Hero.tsx  EntryCard.tsx  Ethos.tsx  Fleet.tsx
      Footer.tsx  Diamond.tsx  Icon.tsx  CurrencyToggle.tsx  Stepper.tsx
      Confirmation.tsx
      booking/BookingOverlay.tsx  ProgressRail.tsx  StageFooter.tsx
      booking/steps/StepJourney.tsx  StepRoute.tsx  StepSchedule.tsx
        StepParty.tsx  StepVehicle.tsx  StepQuote.tsx  StepAccount.tsx
        StepPayment.tsx
    pages/Landing.tsx  MyTrips.tsx  AuthCallback.tsx
```

---

### Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/setupTests.ts`, `.env`, `.env.example`, `src/lib/supabase.ts`
- Test: `src/lib/supabase.test.ts`

**Interfaces:**
- Produces: `supabase` client (`src/lib/supabase.ts` default export named `supabase`). React app mounts at `#root`. Router with route `/` rendering a placeholder.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cabbys-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.107.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.7.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.11",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create config files**

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/setupTests.ts"] },
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020", "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"], "module": "ESNext",
    "skipLibCheck": true, "moduleResolution": "bundler",
    "allowImportingTsExtensions": true, "resolveJsonModule": true,
    "isolatedModules": true, "noEmit": true, "jsx": "react-jsx",
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true, "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true, "skipLibCheck": true, "module": "ESNext",
    "moduleResolution": "bundler", "allowSyntheticDefaultImports": true,
    "strict": true, "noEmit": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
```

`src/setupTests.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Create `.env` (copy real values from `../Others/.env`) and `.env.example`**

`.env` — copy `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `../Others/.env` verbatim.
`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Optional — payment goes live only when these are set
VITE_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
```

- [ ] **Step 4: Create `index.html`, `src/main.tsx`, `src/App.tsx`**

`index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cabby's — Arrive in silence.</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/tokens.css";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </React.StrictMode>
);
```

`src/App.tsx`:
```tsx
import { Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<div>Cabby's</div>} />
    </Routes>
  );
}
```

Create empty `src/styles/tokens.css` and `src/styles/globals.css` so imports resolve (filled in Task 2).

- [ ] **Step 5: Create `src/lib/supabase.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);
```

- [ ] **Step 6: Write the failing test `src/lib/supabase.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { supabase } from "./supabase";

describe("supabase client", () => {
  it("exposes auth and from()", () => {
    expect(supabase).toBeTruthy();
    expect(typeof supabase.from).toBe("function");
    expect(typeof supabase.auth.getSession).toBe("function");
  });
});
```

- [ ] **Step 7: Install deps and run the test**

Run: `npm install && npm test`
Expected: the supabase test PASSES (env vars present from `.env`). If `createClient` throws on empty env, confirm `.env` has the real values.

- [ ] **Step 8: Verify build & dev server**

Run: `npm run build`
Expected: `tsc -b` passes and `vite build` emits `dist/` with no errors.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Scaffold Vite+React+TS app with Supabase client and Vitest"
```

---

### Task 2: Brand tokens & global styles

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/globals.css`

**Interfaces:**
- Produces: CSS custom properties on `:root` (`--midnight`, `--ocean`, `--steel`, `--silver`, `--silver-dim`, `--mist`, `--white`, `--card`, `--card-hi`, `--border`, `--border-hi`, `--hairline`, `--disp`, `--ui`, `--shadow-soft`, `--shadow-card`, `--ease`, `--accent`, `--accent-soft`). Global element resets and the midnight radial-gradient body background.

- [ ] **Step 1: Write `src/styles/tokens.css`**

Port the `:root` block from `../Others/cabbys-web-preview.html` lines 11–33, **removing `--gold`** and adding two accent aliases that map to brand silver/steel (every former gold use points at these):

```css
:root {
  --midnight:#0A1628;
  --ocean:#142238;
  --steel:#2A4A72;
  --silver:#B4C3DC;
  --silver-dim:#7E94B4;
  --mist:#EEF2F8;
  --white:#FFFFFF;

  /* former --gold usages remap here (strict brand) */
  --accent:#B4C3DC;                 /* diamonds, eyebrows, check-ring, done-node */
  --accent-soft:rgba(42,74,114,0.40);/* active tile fill (steel tint) */
  --accent-line:rgba(180,195,220,0.45);

  --card:rgba(255,255,255,0.045);
  --card-hi:rgba(255,255,255,0.07);
  --border:rgba(180,195,220,0.16);
  --border-hi:rgba(180,195,220,0.28);
  --hairline:rgba(180,195,220,0.12);

  --disp:'Cormorant Garamond',serif;
  --ui:'Outfit',sans-serif;

  --shadow-soft:0 40px 100px rgba(10,22,40,0.55);
  --shadow-card:0 24px 60px rgba(5,12,26,0.5);
  --ease:cubic-bezier(.16,.84,.34,1);
}
```

- [ ] **Step 2: Write `src/styles/globals.css`**

Port the global element styles from the prototype lines 34–54 (resets, body radial-gradient background, `::selection` using steel rgba instead of gold, anchor/button/input resets, `.wrap`). Replace `::selection{background:rgba(201,160,90,0.28)...}` with `::selection{background:rgba(42,74,114,0.45);color:#fff;}`:

```css
*{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{
  font-family:var(--ui);
  color:var(--mist);
  -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(ellipse 60% 45% at 14% -6%, #1b3354 0%, transparent 56%),
    radial-gradient(ellipse 55% 55% at 90% 4%, #15294a 0%, transparent 60%),
    var(--midnight);
  background-attachment:fixed;
  min-height:100vh;
  overflow-x:hidden;
  line-height:1.55;
}
::selection{background:rgba(42,74,114,0.45);color:#fff;}
a{color:inherit;text-decoration:none;}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
input,select{font-family:inherit;}
.wrap{max-width:1140px;margin:0 auto;padding:0 28px;}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`, open the app.
Expected: dark midnight gradient background fills the viewport, no gold anywhere.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add brand design tokens and global styles (gold removed)"
```

---

### Task 3: Shared primitives — Diamond, Icon, Nav, Footer

**Files:**
- Create: `src/components/Diamond.tsx`, `src/components/Icon.tsx`, `src/components/Nav.tsx`, `src/components/Footer.tsx`
- Test: `src/components/Nav.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Diamond({ hollow?: boolean, size?: number })` — silver rotated square (former gold).
  - `Icon({ name: IconName, size?: number })` where `IconName = "plane"|"bed"|"sun"|"plate"|"pin"|"spark"|"map"|"clock"|"user"|"bag"|"car"|"card"|"lock"|"check"|"chevron-left"|"close"|"google"|"apple"`. SVG paths copied from prototype `ICONS` (lines 756–762) and inline SVGs throughout.
  - `Nav({ onSignIn: () => void })` — fixed header with scroll-darkening, wordmark + diamond, "The service"/"Fleet" anchors, ghost "Sign in" button.
  - `Footer()` — the footer block (lines 478–508), verbatim copy.

- [ ] **Step 1: Create `Diamond.tsx`**

```tsx
export default function Diamond({ hollow = false, size = 5 }: { hollow?: boolean; size?: number }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      background: hollow ? "transparent" : "var(--accent)",
      border: hollow ? "1px solid var(--silver-dim)" : "none",
      transform: "rotate(45deg)", flexShrink: 0,
    }} />
  );
}
```

- [ ] **Step 2: Create `Icon.tsx`**

Build a `paths` record keyed by `IconName`. Copy the `ICONS` object (prototype lines 756–762) for `plane/bed/sun/plate/pin`, and lift the inline SVG path data for the others from the prototype (ethos icons lines 451–461, party icons 603/614, back/close 536/540, lock 682, card 674, check-ring 705, google 654, apple 658). Render:

```tsx
export type IconName =
  | "plane" | "bed" | "sun" | "plate" | "pin" | "spark" | "map" | "clock"
  | "user" | "bag" | "car" | "card" | "lock" | "check" | "chevron-left"
  | "close" | "google" | "apple";

const paths: Record<IconName, string> = {
  plane: '<path d="M2 13l9-3 4-7 2 1-2 6 5-1 2 2-8 4-2 6-2-1 0-5-6 2-1 2-2-1z"/>',
  bed: '<path d="M3 18v-6h18v6M3 12V8a2 2 0 0 1 2-2h5v6M21 12V8a2 2 0 0 0-2-2h-5M3 18v2M21 18v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plate: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/>',
  pin: '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/>',
  spark: '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
  map: '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  bag: '<rect x="6" y="8" width="12" height="11" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2M9 12v3M15 12v3"/>',
  car: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  "chevron-left": '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  google: '<path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.25 1.36-1.6 4-5.35 4a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.71 3.45 1.32l2.35-2.27C16.46 3.9 14.43 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-2.1Z"/>',
  apple: '<path fill="currentColor" d="M16.36 12.62c.03 2.9 2.55 3.86 2.58 3.87-.02.07-.4 1.38-1.33 2.73-.8 1.17-1.64 2.33-2.96 2.35-1.3.03-1.72-.77-3.2-.77-1.5 0-1.95.75-3.18.8-1.27.05-2.24-1.27-3.05-2.43-1.65-2.4-2.92-6.77-1.22-9.73.84-1.47 2.35-2.4 3.99-2.43 1.25-.02 2.43.84 3.2.84.76 0 2.2-1.04 3.7-.89.63.03 2.4.26 3.54 1.92-.09.06-2.11 1.24-2.08 3.7M14 5.4c.68-.82 1.13-1.96 1-3.1-.97.04-2.15.65-2.85 1.47-.63.72-1.18 1.88-1.03 2.99 1.08.08 2.19-.55 2.88-1.36"/>',
};
const filled: IconName[] = ["google", "apple"];

export default function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const isFilled = filled.includes(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={isFilled ? "currentColor" : "none"}
      stroke={isFilled ? "none" : "currentColor"}
      strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: paths[name] }} />
  );
}
```

- [ ] **Step 3: Create `Nav.tsx` and `Footer.tsx`**

Convert prototype `<header class="nav">` (lines 383–404) and `<footer>` (lines 478–508) to components, with their CSS. Put the component CSS in a co-located `<style>` via a string injected in `globals.css` OR (preferred) add the nav/footer rules to `globals.css`. Use the `mark` SVG wordmark logo from lines 387–396 but recolor the `circle` fill from `#C9A05A` to `var(--accent)`. `Nav` adds a scroll listener toggling a `scrolled` class at `window.scrollY > 12`. The "Sign in" ghost button calls `onSignIn`.

- [ ] **Step 4: Write the failing test `src/components/Nav.test.tsx`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Nav from "./Nav";

describe("Nav", () => {
  it("renders wordmark and triggers sign-in", () => {
    const onSignIn = vi.fn();
    render(<Nav onSignIn={onSignIn} />);
    expect(screen.getByText("Cabby's")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- Nav`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add Diamond, Icon, Nav, Footer primitives"
```

---

### Task 4: Hero + EntryCard + Ethos + Fleet + Landing page

**Files:**
- Create: `src/components/Hero.tsx`, `src/components/EntryCard.tsx`, `src/components/Ethos.tsx`, `src/components/Fleet.tsx`, `src/pages/Landing.tsx`
- Modify: `src/styles/globals.css` (append hero/entry/ethos/fleet rules), `src/App.tsx`
- Test: `src/pages/Landing.test.tsx`

**Interfaces:**
- Consumes: `Nav`, `Footer`, `Diamond`, `Icon`, `data/vehicles.ts` (Task 8 — but Fleet can read a local const until then; see note).
- Produces: `Landing({ onOpenBooking }: { onOpenBooking: (journeyKey?: string) => void })`. `EntryCard({ onBegin })` shows From/To placeholders + "Begin" CTA. Hero copy + meta verbatim from prototype lines 407–443.

- [ ] **Step 1: Port section CSS**

Append to `globals.css` the rules for `.hero`, `.hero-grid`, `.eyebrow`, `.hero-title`, `.hero-sub`, `.hero-meta`, `.entry*`, `.chips/.chip`, `.route/.rfield/.ring/.rdiamond/.rconnector`, `.entry-cta`, `.section-label`, `.ethos*/.ecard`, `.fleet*/.fcard` from prototype lines 81–157. **Recolor:** `.rdiamond{background:var(--gold)}` → `var(--accent)`; `.chip.on` keep as-is (already steel). `.rconnector` gradient `linear-gradient(var(--silver-dim),var(--gold))` → `linear-gradient(var(--silver-dim),var(--accent))`.

- [ ] **Step 2: Create `Hero.tsx`, `EntryCard.tsx`, `Ethos.tsx`, `Fleet.tsx`**

Transcribe the markup from prototype lines 407–475 into these components, copy verbatim. `Ethos` uses three `ecard`s with `Icon name="spark"|"map"|"clock"` and the exact `<h3>`/`<p>` copy (lines 450–464). `Fleet` renders cards from the vehicle list — until Task 8 lands, define a local `const FLEET = [...]` with the four classes (Executive Sedan / Premium Sedan / Luxury SUV / Private Van) and their `pax`/`bags` from prototype lines 749–754; Task 8 replaces this import with `data/vehicles.ts`.

- [ ] **Step 3: Create `Landing.tsx` and wire `App.tsx`**

```tsx
// Landing.tsx
import Nav from "../components/Nav";
import Hero from "../components/Hero";
import Ethos from "../components/Ethos";
import Fleet from "../components/Fleet";
import Footer from "../components/Footer";

export default function Landing({ onOpenBooking }: { onOpenBooking: (journeyKey?: string) => void }) {
  return (
    <>
      <Nav onSignIn={() => onOpenBooking()} />
      <Hero onBegin={() => onOpenBooking()} />
      <Ethos />
      <Fleet />
      <Footer />
    </>
  );
}
```

In `App.tsx`, render `<Landing onOpenBooking={...} />` at `/`. For this task `onOpenBooking` can be a `console.log` placeholder (the overlay arrives in Task 11).

- [ ] **Step 4: Write the failing test `src/pages/Landing.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Landing from "./Landing";

describe("Landing", () => {
  it("renders hero tagline and ethos copy with no exclamation points", () => {
    const { container } = render(<Landing onOpenBooking={() => {}} />);
    expect(screen.getByText(/silence/i)).toBeInTheDocument();
    expect(screen.getByText(/Settled in advance/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain("!");
  });
});
```

- [ ] **Step 5: Run test + visual check**

Run: `npm test -- Landing` → PASS. Then `npm run dev` and compare against `../Others/cabbys-web-preview.html` opened in a browser — hero, entry card, ethos, fleet, footer should match (minus gold).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add landing page: hero, entry card, ethos, fleet"
```

---

### Task 5: Currency module

**Files:**
- Create: `src/lib/currency.ts`
- Test: `src/lib/currency.test.ts`

**Interfaces:**
- Produces:
  - `type Currency = "AWG" | "USD" | "EUR"`
  - `RATES: Record<Currency, number>`, `SYMBOL: Record<Currency, string>`
  - `convert(awg: number, to: Currency): number` — converts from AWG base.
  - `formatMoney(awg: number, to: Currency): string` — e.g. `"ƒ72.00"`, `"$40.22"`.

- [ ] **Step 1: Write the failing test `src/lib/currency.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { convert, formatMoney, RATES, SYMBOL } from "./currency";

describe("currency", () => {
  it("keeps AWG at parity", () => {
    expect(convert(72, "AWG")).toBe(72);
    expect(formatMoney(72, "AWG")).toBe("ƒ72.00");
  });
  it("converts AWG to USD at the pegged rate", () => {
    expect(convert(179, "USD")).toBeCloseTo(100, 2);
    expect(SYMBOL.USD).toBe("$");
  });
  it("converts AWG to EUR", () => {
    expect(convert(197, "EUR")).toBeCloseTo(100, 2);
    expect(RATES.EUR).toBeCloseTo(1 / 1.97, 5);
  });
  it("formats with two decimals and symbol", () => {
    expect(formatMoney(40, "EUR")).toBe("€20.30");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- currency`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/currency.ts`**

```ts
export type Currency = "AWG" | "USD" | "EUR";

export const RATES: Record<Currency, number> = { AWG: 1, USD: 1 / 1.79, EUR: 1 / 1.97 };
export const SYMBOL: Record<Currency, string> = { AWG: "ƒ", USD: "$", EUR: "€" };

export function convert(awg: number, to: Currency): number {
  return awg * RATES[to];
}

export function formatMoney(awg: number, to: Currency): string {
  return `${SYMBOL[to]}${convert(awg, to).toFixed(2)}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- currency`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add currency conversion module (AWG/USD/EUR)"
```

---

### Task 6: Fare engine port

**Files:**
- Create: `src/lib/pricing.ts`
- Test: `src/lib/pricing.test.ts`

**Interfaces:**
- Consumes: `supabase` (mocked in tests).
- Produces (ported from `../Others/src/pricing.js`, typed):
  - `type Pricing = { zones; locations; routes; addons; config: Record<string, number>; loaded: boolean }`
  - `loadPricing(island?: string, force?: boolean): Promise<Pricing>`
  - `zoneForLocation(p: Pricing, name: string): string | null`
  - `baseRoutePrice(p, pickup, dropoff): { price: number; source: "route"|"zone"|"min" }`
  - `computeFare(p, opts): FareResult` where `FareResult = { base: number; total: number; lineItems: LineItem[]; source: string }` (AWG, pre-tax)
  - `LineItem = { label: string; amount: number; kind: string; note?: string }`
  - `addTax(subtotalAwg: number, rate?: number): { tax: number; total: number }` — new helper, default `rate = 0.06`.

- [ ] **Step 1: Write failing tests `src/lib/pricing.test.ts`**

Mock supabase so `loadPricing` returns fixed data, then assert `computeFare` and `addTax`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => {
  const data = {
    pricing_zones: [{ zone_code: "A", island: "aruba", active: true }],
    pricing_locations: [
      { name: "Queen Beatrix International Airport", zone_code: "AIRPORT" },
      { name: "Palm Beach", zone_code: "A" },
      { name: "Eagle Beach", zone_code: "A" },
    ],
    pricing_routes: [
      { from_name: "Airport", to_name: "Palm Beach", price: 40, bidirectional: true },
      { from_name: "Palm Beach", to_name: "Eagle Beach", price: 12, bidirectional: true },
    ],
    pricing_addons: [
      { key: "late_night", label: "Late-night", kind: "percent", amount: 15, sort: 1 },
      { key: "luxury", label: "Luxury", kind: "percent", amount: 40, sort: 2 },
      { key: "child_seat", label: "Child seat", kind: "flat", amount: 5, sort: 3 },
    ],
    pricing_config: [
      { key: "min_fare", value: 12 }, { key: "late_night_start", value: 23 }, { key: "late_night_end", value: 5 },
    ],
  };
  const builder = (table: string) => {
    const rows = (data as any)[table] || [];
    const b: any = {
      _rows: rows,
      select() { return b; }, eq() { return b; }, order() { return b; },
      then(res: any) { return Promise.resolve({ data: rows, error: null }).then(res); },
    };
    return b;
  };
  return { supabase: { from: builder } };
});

import { loadPricing, computeFare, addTax, zoneForLocation } from "./pricing";

describe("pricing engine", () => {
  let p: Awaited<ReturnType<typeof loadPricing>>;
  beforeEach(async () => { p = await loadPricing("aruba", true); });

  it("loads config as numbers", () => {
    expect(p.config.min_fare).toBe(12);
    expect(p.loaded).toBe(true);
  });
  it("resolves airport by name to AIRPORT zone", () => {
    expect(zoneForLocation(p, "Queen Beatrix International Airport")).toBe("AIRPORT");
  });
  it("prices a named route (airport collapses)", () => {
    const f = computeFare(p, { pickup: "Queen Beatrix International Airport", dropoff: "Palm Beach", when: new Date("2026-06-26T14:00:00") });
    expect(f.source).toBe("route");
    expect(f.total).toBe(40);
  });
  it("applies a daytime fare with no late-night surcharge", () => {
    const f = computeFare(p, { pickup: "Palm Beach", dropoff: "Eagle Beach", when: new Date("2026-06-26T14:00:00") });
    expect(f.total).toBe(12);
  });
  it("adds late-night 15% after 23:00", () => {
    const f = computeFare(p, { pickup: "Airport", dropoff: "Palm Beach", when: new Date("2026-06-26T23:30:00") });
    expect(f.total).toBeCloseTo(46, 2);
  });
  it("adds 6% tax", () => {
    expect(addTax(100).tax).toBeCloseTo(6, 2);
    expect(addTax(100).total).toBeCloseTo(106, 2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- pricing`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/pricing.ts`**

Port `../Others/src/pricing.js` verbatim into TS: keep `loadPricing`, `clearPricingCache`, `zoneForLocation`, `routeKey`, `matchRoute`, `baseRoutePrice`, `isLateNight`, `computeFare` exactly (add types per the Interfaces block; the supabase calls and logic are unchanged). Append the new helper:

```ts
export function addTax(subtotalAwg: number, rate = 0.06): { tax: number; total: number } {
  const tax = Math.round(subtotalAwg * rate * 100) / 100;
  return { tax, total: Math.round((subtotalAwg + tax) * 100) / 100 };
}
```

Note: `loadPricing` must `await Promise.all` of five `supabase.from(...).select(...)...` calls exactly as the JS source; the test mock resolves each builder via `then`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- pricing`
Expected: PASS (all six tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Port DB-driven fare engine to TS with 6% tax helper"
```

---

### Task 7: Data modules + capacity helper

**Files:**
- Create: `src/data/hotels.ts`, `src/data/journeys.ts`, `src/data/vehicles.ts`
- Modify: `src/components/Fleet.tsx` (import from `data/vehicles.ts`)
- Test: `src/data/vehicles.test.ts`

**Interfaces:**
- Produces:
  - `hotels.ts`: `AIRPORT: Place`, `HOTELS: Place[]`, `CUSTOM_LOC: Place` where `type Place = { id: string; name: string; meta: string; zone: string }`. Values from prototype lines 731–740, with hotel names matching `pricing_locations` so the engine resolves zones (use `"The Ritz-Carlton Aruba"` to match the DB row).
  - `journeys.ts`: `JOURNEYS: { key; title; desc; icon: IconName }[]` from lines 723–729.
  - `vehicles.ts`: `VEHICLES: Vehicle[]` where `type Vehicle = { id; name; pax: number; bags: number; mult: number; note: string; desc: string }` from lines 749–754; plus `fitsParty(v: Vehicle, passengers: number, luggage: number): boolean`.

- [ ] **Step 1: Write failing test `src/data/vehicles.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { VEHICLES, fitsParty } from "./vehicles";

describe("vehicles", () => {
  it("has the four classes", () => {
    expect(VEHICLES.map(v => v.id)).toEqual(["sedan", "premium", "suv", "van"]);
  });
  it("fitsParty validates passengers and luggage capacity", () => {
    const sedan = VEHICLES.find(v => v.id === "sedan")!;
    expect(fitsParty(sedan, 3, 3)).toBe(true);
    expect(fitsParty(sedan, 4, 3)).toBe(false);
    expect(fitsParty(sedan, 3, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- vehicles`
Expected: FAIL.

- [ ] **Step 3: Implement the three data modules**

`vehicles.ts`:
```ts
export type Vehicle = { id: string; name: string; pax: number; bags: number; mult: number; note: string; desc: string };

export const VEHICLES: Vehicle[] = [
  { id: "sedan",   name: "Executive Sedan", pax: 3, bags: 3, mult: 1.0,  note: "",           desc: "Mercedes E-Class or similar" },
  { id: "premium", name: "Premium Sedan",   pax: 3, bags: 3, mult: 1.38, note: "Most chosen", desc: "Mercedes S-Class or similar" },
  { id: "suv",     name: "Luxury SUV",      pax: 6, bags: 5, mult: 1.6,  note: "",           desc: "Cadillac Escalade or similar" },
  { id: "van",     name: "Private Van",     pax: 7, bags: 8, mult: 2.05, note: "",           desc: "Mercedes V-Class or similar" },
];

export function fitsParty(v: Vehicle, passengers: number, luggage: number): boolean {
  return passengers <= v.pax && luggage <= v.bags;
}
```

`hotels.ts` and `journeys.ts`: transcribe from the prototype (use `IconName` for journey icons; map `"plate"`→plate, etc.). **Important:** hotel `name` strings must match `pricing_locations` exactly (`"Aruba Marriott Resort"`, `"Hyatt Regency Aruba"`, `"Hilton Aruba"`, `"The Ritz-Carlton Aruba"`, `"Manchebo Beach Resort"`, `"Renaissance Aruba"`). Renaissance is not in the sample we pulled — keep its prototype zone `"A"` as a fallback; the engine still falls back to zone/min fare if unmatched.

- [ ] **Step 4: Update `Fleet.tsx` to import `VEHICLES`**

Replace the local `FLEET` const with `import { VEHICLES } from "../data/vehicles";`.

- [ ] **Step 5: Run test**

Run: `npm test -- vehicles`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add hotels/journeys/vehicles data and capacity helper"
```

---

### Task 8: Booking payload builder

**Files:**
- Create: `src/lib/bookingPayload.ts`
- Test: `src/lib/bookingPayload.test.ts`

**Interfaces:**
- Produces:
  - `type BookingState` (the fields the overlay collects — see below).
  - `buildRidePayload(state: BookingState, userId: string): { core: Record<string, unknown>; withCoords: Record<string, unknown> }` — mirrors `App.jsx` ~2024, no coords lookup (web has no Mapbox; lat/lng omitted → engine/insert still valid).

- [ ] **Step 1: Write failing test `src/lib/bookingPayload.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildRidePayload, type BookingState } from "./bookingPayload";

const base: BookingState = {
  journey: "airport", from: "Queen Beatrix International Airport", to: "Palm Beach",
  date: "2026-07-01", time: "14:30", passengers: 2, luggage: 2,
  vehicle: "sedan", fareBase: 40, fareTotal: 42.4, addonKeys: [],
};

describe("buildRidePayload", () => {
  it("builds core columns that exist on rides", () => {
    const { core } = buildRidePayload(base, "user-123");
    expect(core).toMatchObject({
      passenger_id: "user-123",
      pickup_location: "Queen Beatrix International Airport",
      dropoff_location: "Palm Beach",
      vehicle_type: "sedan", passengers_count: 2,
      price: 42.4, status: "pending",
    });
  });
  it("builds withCoords with canonical fare + scheduled_at", () => {
    const { withCoords } = buildRidePayload(base, "user-123");
    expect(withCoords).toMatchObject({
      vehicle_class: "sedan", fare_base: 40, fare_total: 42.4, is_asap: false,
    });
    expect(typeof withCoords.scheduled_at).toBe("string");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- bookingPayload`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/bookingPayload.ts`**

```ts
export type BookingState = {
  journey: string | null;
  from: string; to: string;
  date: string; time: string;
  passengers: number; luggage: number;
  vehicle: string | null;
  fareBase: number; fareTotal: number;
  addonKeys: string[];
};

export function buildRidePayload(s: BookingState, userId: string) {
  const scheduledAt = new Date(`${s.date}T${s.time || "00:00"}`).toISOString();
  const core = {
    passenger_id: userId,
    pickup_location: s.from,
    dropoff_location: s.to,
    scheduled_date: s.date,
    scheduled_time: s.time,
    vehicle_type: s.vehicle,
    passengers_count: s.passengers,
    price: s.fareTotal,
    addons: s.addonKeys,
    status: "pending",
  };
  const withCoords = {
    ...core,
    scheduled_at: scheduledAt,
    is_asap: false,
    vehicle_class: s.vehicle,
    fare_base: s.fareBase,
    fare_discount: 0,
    fare_total: s.fareTotal,
  };
  return { core, withCoords };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- bookingPayload`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add rides booking payload builder"
```

---

### Task 9: BookingContext state machine

**Files:**
- Create: `src/booking/BookingContext.tsx`
- Test: `src/booking/BookingContext.test.tsx`

**Interfaces:**
- Consumes: `BookingState` shape (extends it with UI fields), `VEHICLES`/`fitsParty`.
- Produces: `BookingProvider`, and `useBooking()` returning:
  - `state` (journey, from, to, fromCustom, toCustom, date, time, passengers, luggage, vehicle, currency, step, open)
  - actions: `open(journeyKey?)`, `close()`, `setField(key, value)`, `next()`, `back()`, `goTo(step)`, `reset()`
  - derived: `canContinue: boolean` (per-step validation), `STEP_NAMES: string[]`.

- [ ] **Step 1: Write failing test `src/booking/BookingContext.test.tsx`**

```tsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "./BookingContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <BookingProvider>{children}</BookingProvider>;

describe("BookingContext", () => {
  it("opens on a journey and gates step 0 until a journey is chosen", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    expect(result.current.state.open).toBe(false);
    act(() => result.current.open());
    expect(result.current.state.open).toBe(true);
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("journey", "airport"));
    expect(result.current.canContinue).toBe(true);
  });
  it("requires both route ends before leaving step 1", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => { result.current.open("airport"); result.current.next(); });
    expect(result.current.state.step).toBe(1);
    expect(result.current.canContinue).toBe(false);
    act(() => { result.current.setField("from", "Airport"); result.current.setField("to", "Palm Beach"); });
    expect(result.current.canContinue).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- BookingContext`
Expected: FAIL.

- [ ] **Step 3: Implement `BookingContext.tsx`**

Create a context with `useReducer` (or `useState`) holding the state object. `STEP_NAMES = ['Occasion','Route','Schedule','Party','Vehicle','Fare','Account','Payment']`. `canContinue` switches on `state.step`:
- 0: `!!journey`
- 1: `!!from && !!to`
- 2: `!!date && !!time`
- 3: `passengers >= 1`
- 4: `!!vehicle`
- 5: `true` (quote shown)
- 6: handled by auth (Task 13) — default `true` once signed in
- 7: payment validity (Task 14)

`open(journeyKey?)` sets `open=true`, `step=0`, and `journey=journeyKey ?? null`. `next()` increments step only if `canContinue`. Provide `useBooking()` throwing if used outside the provider.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- BookingContext`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add BookingContext state machine with per-step validation"
```

---

### Task 10: Booking overlay shell — ProgressRail, StageFooter, open/close

**Files:**
- Create: `src/components/booking/BookingOverlay.tsx`, `src/components/booking/ProgressRail.tsx`, `src/components/booking/StageFooter.tsx`
- Modify: `src/App.tsx` (wrap in `BookingProvider`, render overlay; wire `Landing onOpenBooking` → `open`), `src/styles/globals.css` (overlay/rail/stage CSS)
- Test: `src/components/booking/BookingOverlay.test.tsx`

**Interfaces:**
- Consumes: `useBooking()`.
- Produces: `BookingOverlay()` — full-screen overlay with rail (left) + stage (right), step-name progress, back/close, sticky footer with `Continue`/contextual label. Renders the active step component (placeholder text until Tasks 11–14 fill steps).

- [ ] **Step 1: Port overlay CSS**

Append prototype lines 171–334 (`.overlay`, `.ov-*`, `.rail`, `.rstep`, `.stage`, `.stage-*`, `.step`, `.stage-foot`, `.btn-primary`, `.btn-back`) to `globals.css`. **Recolor:** `.rstep.done .node{border-color:var(--gold);background:var(--gold)}` → `var(--accent)`; `.step-eyebrow{color:var(--gold)}` → `var(--silver)`.

- [ ] **Step 2: Create `ProgressRail.tsx` and `StageFooter.tsx`**

`ProgressRail` maps `STEP_NAMES` to `.rstep` nodes, applying `done`/`active` from `state.step`. `StageFooter` shows `foot-summary` text + a `btn-primary` "Continue →" calling `next()`, disabled when `!canContinue`. On the last step the button label/behaviour is overridden by `StepPayment` (Task 14) via a render prop or context flag — for now it always calls `next()`.

- [ ] **Step 3: Create `BookingOverlay.tsx`**

Structure mirrors prototype lines 511–698: scrim (click → `close()`), `ov-panel` grid, `rail` (brand + `<ProgressRail/>` + rail-foot copy), `stage` (sticky `stage-top` with back/`Step N of 8`/close, `stage-body` rendering the active step, `<StageFooter/>`). Add `.overlay.open` class when `state.open`. Render a `switch(state.step)` returning step components; until they exist, render `<div>Step {step}</div>`.

- [ ] **Step 4: Wire `App.tsx`**

Wrap routes in `<BookingProvider>`. In a child that calls `useBooking()`, pass `open` to `<Landing onOpenBooking={open} />` and render `<BookingOverlay/>` + (later) `<Confirmation/>` as siblings.

- [ ] **Step 5: Write failing test `BookingOverlay.test.tsx`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../booking/BookingContext";
import BookingOverlay from "./BookingOverlay";

function Harness() {
  const { open } = useBooking();
  return <><button onClick={() => open("airport")}>go</button><BookingOverlay /></>;
}

describe("BookingOverlay", () => {
  it("shows step 1 of 8 when opened", () => {
    render(<BookingProvider><Harness /></BookingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByText(/Step 1 of 8/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test + visual**

Run: `npm test -- BookingOverlay` → PASS. `npm run dev`: clicking "Begin" opens the overlay with the rail and step names.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Add booking overlay shell with progress rail and footer"
```

---

### Task 11: Steps 1–4 — Journey, Route, Schedule, Party

**Files:**
- Create: `src/components/booking/steps/StepJourney.tsx`, `StepRoute.tsx`, `StepSchedule.tsx`, `StepParty.tsx`, `src/components/Stepper.tsx`
- Modify: `BookingOverlay.tsx` (render these for steps 0–3), `EntryCard.tsx` (reflect chosen journey chips → `open(journeyKey)`)
- Test: `src/components/booking/steps/StepRoute.test.tsx`, `StepParty.test.tsx`

**Interfaces:**
- Consumes: `useBooking()`, `JOURNEYS`, `HOTELS`/`AIRPORT`/`CUSTOM_LOC`, `Stepper`.
- Produces: four step components writing into `BookingContext` via `setField`. `Stepper({ value, min, max, onChange })`.

- [ ] **Step 1: Create `Stepper.tsx`**

Port `.stepper` markup (lines 606–610): minus/value/plus, disabled at bounds, calling `onChange(value ± 1)`.

- [ ] **Step 2: Create the four step components**

- `StepJourney` — `jt-grid` of `JOURNEYS` tiles (lines 546–552 + 723–729); selecting sets `journey` and enables Continue. `.jt.on` recolor: border `var(--accent)`, background `var(--accent-soft)`.
- `StepRoute` — two `loc-block`s (pickup/destination), each an `opt-list` of `AIRPORT` + `HOTELS` + a "Somewhere else" option revealing an `input.txt` writing `fromCustom`/`toCustom`. `.opt.on` recolor to accent. Selecting writes `from`/`to` (custom text when "Somewhere else").
- `StepSchedule` — date + time inputs (`field-pair`) writing `date`/`time`, plus quick-choice list (e.g. "This evening 18:00", "Tonight 21:00") that sets time.
- `StepParty` — two `count-row`s with `Stepper` for `passengers` (min 1) and `luggage` (min 0).

- [ ] **Step 3: Wire `EntryCard` chips**

Render journey chips (from `JOURNEYS`) in the entry card; clicking a chip calls `onBegin(journey.key)` so the overlay opens pre-seeded. From/To placeholders stay static text.

- [ ] **Step 4: Write failing tests**

`StepRoute.test.tsx`: render within provider at step 1, click the airport option then a hotel option, assert `canContinue` becomes true (via a small harness reading `useBooking()`).
`StepParty.test.tsx`: render at step 3, click passengers "+", assert the number increments and never drops below 1.

```tsx
// StepParty.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepParty from "./StepParty";

function Harness() {
  const { open } = useBooking();
  return <><button onClick={() => open("airport")}>go</button><StepParty /></>;
}

describe("StepParty", () => {
  it("increments passengers and clamps at the minimum", () => {
    render(<BookingProvider><Harness /></BookingProvider>);
    fireEvent.click(screen.getByText("go"));
    const plus = screen.getAllByRole("button", { name: "+" })[0];
    fireEvent.click(plus);
    expect(screen.getByTestId("pax-num").textContent).toBe("3");
  });
});
```

(Implement `StepParty` passengers value with `data-testid="pax-num"`, default 2.)

- [ ] **Step 5: Run tests + visual**

Run: `npm test -- Step` → PASS. `npm run dev`: walk steps 1→4.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add booking steps 1-4: journey, route, schedule, party"
```

---

### Task 12: Step 5 Vehicle + Step 6 Quote (live fare)

**Files:**
- Create: `src/components/booking/steps/StepVehicle.tsx`, `StepQuote.tsx`, `src/components/CurrencyToggle.tsx`, `src/booking/useFare.ts`
- Modify: `BookingOverlay.tsx` (steps 4–5)
- Test: `src/booking/useFare.test.tsx`, `src/components/booking/steps/StepVehicle.test.tsx`

**Interfaces:**
- Consumes: `useBooking()`, `loadPricing`/`computeFare`/`addTax`, `VEHICLES`/`fitsParty`, `convert`/`formatMoney`/`SYMBOL`.
- Produces:
  - `useFare()` → `{ loading, fare, tax, total, lineItems }` (AWG), recomputed from `state.from/to/date/time/vehicle/addonKeys`. Applies the vehicle `mult` to the engine base, then `addTax`.
  - `StepVehicle` — `veh-list`; cars where `!fitsParty` get `.disabled` + "Too small for your party". Each shows its fare via `useFare`-style per-vehicle compute. Selecting sets `vehicle`.
  - `StepQuote` — `CurrencyToggle` (AWG/USD/EUR) + quote card (route, sub-meta, line items incl. a "Government & facility tax (6%)" line, total) all formatted via `formatMoney`.

- [ ] **Step 1: Write failing test `useFare.test.tsx`** (mock pricing like Task 6)

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
// reuse the same vi.mock("../lib/supabase", ...) fixture as pricing.test.ts
```

Assert that for Airport→Palm Beach with the Executive Sedan (`mult 1.0`) at 14:00, `total ≈ 42.4` (40 + 6% tax).

- [ ] **Step 2: Run to verify it fails** — `npm test -- useFare` → FAIL.

- [ ] **Step 3: Implement `useFare.ts`, `CurrencyToggle.tsx`, the two steps**

`useFare` loads pricing once (effect), recomputes synchronously on state change: `base = computeFare(...).total * vehicleMult`, then `{ tax, total } = addTax(base)`. `CurrencyToggle` writes `state.currency`. `StepQuote` renders amounts with `formatMoney(amountAwg, state.currency)`. Recolor `.cur-toggle button.on` stays steel (already brand). `.veh.on`/`.veh-flag` recolor to accent.

- [ ] **Step 4: Run tests + visual** — `npm test -- "useFare|StepVehicle"` → PASS; `npm run dev` shows real fares and currency switching.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add vehicle selection and live AWG/USD/EUR quote with 6% tax"
```

---

### Task 13: Step 7 Account — OAuth + magic-link, AuthCallback, auth state

**Files:**
- Create: `src/components/booking/steps/StepAccount.tsx`, `src/pages/AuthCallback.tsx`, `src/booking/useAuth.ts`
- Modify: `App.tsx` (route `/auth/callback`, provide auth), `BookingOverlay.tsx` (step 6), `BookingContext.tsx` (`canContinue` step 6 = signed in)
- Test: `src/booking/useAuth.test.tsx`

**Interfaces:**
- Consumes: `supabase.auth`.
- Produces:
  - `useAuth()` → `{ user, loading, signInWithProvider(p: "google"|"apple"), signInWithEmail(email), signOut() }`. Uses `onAuthStateChange` + `getSession`.
  - `StepAccount` — Google/Apple `oauth-btn`s (calling `signInWithProvider`) + an email field with a "Continue with email" magic-link button (fallback while OAuth disabled). When `user` is set, show "Signed in as …" and enable Continue.
  - `AuthCallback` — calls `supabase.auth.getSession()`, then navigates back to `/` (the overlay state persists if booking kept in context/localStorage; minimal: route home).

- [ ] **Step 1: Write failing test `useAuth.test.tsx`** — mock `supabase.auth` (`getSession` resolves `{data:{session:null}}`, `onAuthStateChange` returns `{data:{subscription:{unsubscribe(){}}}}`, `signInWithOtp`/`signInWithOAuth` are `vi.fn()`); assert `signInWithEmail("a@b.com")` calls `signInWithOtp` with that email.

- [ ] **Step 2: Run to verify it fails** — `npm test -- useAuth` → FAIL.

- [ ] **Step 3: Implement `useAuth.ts`**

```ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  const redirectTo = `${window.location.origin}/auth/callback`;
  return {
    user, loading,
    signInWithProvider: (provider: "google" | "apple") =>
      supabase.auth.signInWithOAuth({ provider, options: { redirectTo } }),
    signInWithEmail: (email: string) =>
      supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }),
    signOut: () => supabase.auth.signOut(),
  };
}
```

Implement `StepAccount` and `AuthCallback` per the Interfaces. Update `BookingContext` step-6 `canContinue` to read an injected `signedIn` flag (pass `user` down, or have `StepAccount` call `setField("signedIn", true)`).

- [ ] **Step 4: Run test** — `npm test -- useAuth` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add account step with OAuth + email magic-link fallback"
```

---

### Task 14: Step 8 Payment (reserve-now) + booking write + Confirmation

**Files:**
- Create: `src/components/booking/steps/StepPayment.tsx`, `src/components/Confirmation.tsx`
- Modify: `BookingOverlay.tsx` (step 7), `App.tsx` (render `<Confirmation/>`)
- Test: `src/components/booking/steps/StepPayment.test.tsx`

**Interfaces:**
- Consumes: `useBooking()`, `useAuth()`, `buildRidePayload`, `supabase`, `useFare`.
- Produces: `StepPayment` — reserve-now card; on "Confirm" it builds the payload, inserts into `rides` (try `withCoords`, on error retry `core`), then triggers `Confirmation` with the returned `rides.id`. `Confirmation({ booking })` — full-screen midnight, silver animated check-ring, glass card rising from bottom (prototype lines 700–712 + 336–374), recolored to accent.

- [ ] **Step 1: Write failing test `StepPayment.test.tsx`**

Mock `supabase.from("rides").insert(...).select().single()` to resolve `{ data: { id: "ride-1" }, error: null }` and `useAuth` to return a user. Render `StepPayment` within providers at step 7, click "Confirm", assert `supabase.from` was called with `"rides"` and the confirmation reference "ride-1" appears (via an `onConfirmed` spy or rendered text).

- [ ] **Step 2: Run to verify it fails** — `npm test -- StepPayment` → FAIL.

- [ ] **Step 3: Implement `StepPayment.tsx` + `Confirmation.tsx`**

`StepPayment` confirm handler:
```ts
const { withCoords, core } = buildRidePayload(payloadState, user.id);
let { data, error } = await supabase.from("rides").insert(withCoords).select().single();
if (error) ({ data, error } = await supabase.from("rides").insert(core).select().single());
if (error) { setError(error.message); return; }
onConfirmed({ ...summary, rideId: data.id });
```
Render the Stripe Payment Element only when `import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY` is set (Task 15); otherwise the reserve-now card with the `pay-secure` reassurance copy. `Confirmation` animates in when `booking` is set and closes the overlay.

- [ ] **Step 4: Run test + manual** — `npm test -- StepPayment` → PASS. `npm run dev`: complete a booking end-to-end (sign in via email magic-link), confirm a real `rides` row is created (check Supabase, or My Trips in Task 15).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add payment step, rides booking write, and confirmation screen"
```

---

### Task 15: My Trips page + Stripe scaffold + Vercel deploy config

**Files:**
- Create: `src/pages/MyTrips.tsx`, `src/lib/stripe.ts`, `api/create-payment-intent.ts`, `vercel.json`, `README.md`
- Modify: `App.tsx` (route `/trips`), `Nav.tsx`/`Footer.tsx` (link to `/trips`)
- Test: `src/pages/MyTrips.test.tsx`

**Interfaces:**
- Consumes: `supabase`, `useAuth`, `formatMoney`.
- Produces: `MyTrips()` reading `rides` for the signed-in user; `loadStripe`-style lazy helper in `lib/stripe.ts` (returns `null` when no publishable key); a Vercel function that 501s unless `STRIPE_SECRET_KEY` set.

- [ ] **Step 1: Implement `MyTrips.tsx`**

On mount, if `user`, `supabase.from("rides").select("*").eq("passenger_id", user.id).order("created_at", { ascending: false })`. Render brand-styled cards (route, date/time, vehicle, `formatMoney(fare_total ?? price, "AWG")`, status). If not signed in, show a sign-in prompt.

- [ ] **Step 2: Implement `lib/stripe.ts` and `api/create-payment-intent.ts`**

`lib/stripe.ts`:
```ts
import { loadStripe, type Stripe } from "@stripe/stripe-js";
let p: Promise<Stripe | null> | null = null;
export function getStripe() {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!p) p = loadStripe(key);
  return p;
}
```
(Add `@stripe/stripe-js` to deps. The import stays tree-shake-safe; `getStripe()` returns `null` without a key so nothing loads.)

`api/create-payment-intent.ts` (Vercel Node function):
```ts
export default async function handler(req: any, res: any) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(501).json({ error: "Stripe not configured" });
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);
  const { amount, currency = "usd" } = req.body ?? {};
  const intent = await stripe.paymentIntents.create({ amount, currency, automatic_payment_methods: { enabled: true } });
  return res.status(200).json({ clientSecret: intent.client_secret });
}
```
(`stripe` is an optional dependency installed only when wiring real payments; the function dynamically imports it so the build doesn't require it.)

- [ ] **Step 3: Create `vercel.json` and `README.md`**

`vercel.json`:
```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```
`README.md`: setup, `.env` keys, `npm run dev/build/test`, deploy notes, and the "enable Google/Apple in Supabase + add Stripe keys to go live" checklist.

- [ ] **Step 4: Write failing test `MyTrips.test.tsx`**

Mock `useAuth` (user present) and `supabase.from("rides")...` to resolve two rows; assert both route strings render.

- [ ] **Step 5: Run tests + full verification**

Run: `npm test` (whole suite) → all PASS.
Run: `npm run build` → succeeds.
`npm run dev`: book a trip, then `/trips` shows it.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add My Trips, dormant Stripe scaffold, and Vercel deploy config"
```

---

## Self-Review Notes

- **Spec coverage:** §1 schema → Tasks 1,6,8,14 (rides/pricing, no schema changes). §2 brand/gold-removal → Tasks 2–4,10,12,14 (explicit recolor steps). §3 structure → Task 1 + file map. §4 8-step flow → Tasks 9–14 (names match). §5 pricing+tax → Tasks 5,6,12. §6 rides write → Tasks 8,14. §7 auth → Task 13. §8 My Trips → Task 15. §9 Stripe dormant → Task 15. §10 YAGNI honored. §11 deliverable order preserved (landing reviewable after Task 4).
- **Placeholder scan:** UI-port steps reference exact prototype line ranges rather than re-pasting ~1,000 lines; all logic modules carry full code + tests. No "TBD"/"add error handling" left.
- **Type consistency:** `BookingState`/`buildRidePayload` (Task 8), `useFare` result (Task 12), `useAuth` shape (Task 13), `Vehicle`/`fitsParty` (Task 7), `Currency` (Task 5) names are used consistently across consumers.
