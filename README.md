# Cabby's Aruba — Web App

Private, fixed-price transfers across Aruba. Booked from anywhere, settled before you land.

## Technology

- **Frontend:** React 18 + TypeScript, Vite, React Router v6
- **Backend/DB:** Supabase (PostgreSQL, Auth, Storage)
- **Payments:** Stripe (dormant scaffold — see Going Live below)
- **Hosting:** Vercel (SPA rewrites via `vercel.json`)

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd Cabbys-web
npm install
```

### 2. Environment variables

Create a `.env.local` file at the project root:

```env
# Supabase (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Stripe (optional — only needed for live payments)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Server-side env vars (set in Vercel dashboard or `.env.local` for local Vercel dev):

```env
# Stripe server key (optional — activates api/create-payment-intent)
STRIPE_SECRET_KEY=sk_live_...
```

### 3. Run locally

```bash
npm run dev       # development server at http://localhost:5173
npm run build     # production build (outputs to dist/)
npm run preview   # preview the production build locally
npm test          # run the full Vitest test suite
```

---

## Project Structure

```
src/
  booking/        # Booking flow context, hooks, steps
  components/     # Nav, Footer, shared UI
  lib/            # supabase client, currency utils, stripe lazy loader
  pages/          # Landing, AuthCallback, MyTrips
  styles/         # CSS tokens and global styles
api/
  create-payment-intent.ts   # Vercel function (dormant until Stripe configured)
vercel.json                  # SPA rewrite rules
```

---

## Deploy to Vercel

1. Import this repository into Vercel.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel → Settings → Environment Variables.
3. Deploy. The `vercel.json` rewrite rule sends all non-API routes to `index.html` so React Router handles navigation.

---

## Going Live Checklist

Before accepting real bookings:

- [ ] **Supabase Auth providers** — enable Google OAuth and Apple Sign In under Authentication → Providers in the Supabase dashboard. Add the Vercel production URL as an allowed redirect URL.
- [ ] **Supabase RLS** — review row-level security policies on the `rides` table so passengers can only read their own rows.
- [ ] **Stripe publishable key** — add `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...` to Vercel env vars. The `getStripe()` helper in `src/lib/stripe.ts` returns `null` until this is set, so no Stripe JS loads in production until then.
- [ ] **Stripe secret key** — add `STRIPE_SECRET_KEY=sk_live_...` to Vercel env vars. The `api/create-payment-intent` function returns HTTP 501 until this is present.
- [ ] **Install stripe package** — run `npm i stripe` and commit `package.json` / `package-lock.json` once you are ready to wire real payment intents. The `api/` function uses a dynamic import so the Vite build succeeds without `stripe` installed.
- [ ] **Webhook** — configure a Stripe webhook endpoint pointing at `/api/stripe-webhook` (to be implemented) and add `STRIPE_WEBHOOK_SECRET` to env vars.
- [ ] **Custom domain** — point your domain to Vercel and update `VITE_SUPABASE_URL` site URL + redirect URLs accordingly.

---

## .env Keys Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key — activates client-side Stripe.js |
| `STRIPE_SECRET_KEY` | No (server) | Stripe secret key — activates the payment intent API function |

---

## Tax

A 6% government and facility tax applies to every fare. All fares are shown in Aruban florin (AWG) by default and can be toggled to USD or EUR.
