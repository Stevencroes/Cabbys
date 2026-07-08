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

- [ ] **Schema migration** — run `docs/schema.sql` in the Supabase SQL editor. It adds the booking-flow columns (booking ref, guest contact, flight, payment, driver), relaxes `passenger_id` for guest checkout, and sets the RLS policies.
- [ ] **Anonymous sign-ins** — enable under Authentication → Providers → Anonymous. Guest checkout uses `signInAnonymously()` so every booking still has an `auth.uid()`.
- [ ] **Supabase Auth providers** — enable Google OAuth under Authentication → Providers. Add the Vercel production URL as an allowed redirect URL.
- [ ] **Realtime** — add the `rides` table to the `supabase_realtime` publication so My Trips reflects driver assignment live.
- [ ] **Stripe publishable key** — add `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...` to Vercel env vars. Until it is set the flow runs in "Reserve now, settle on the day" mode; with it set, cards are authorized at booking (manual capture).
- [ ] **Stripe secret key + service role** — add `STRIPE_SECRET_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel env vars. `api/create-payment-intent` prices the intent **server-side from the ride row** (never from the client) and returns HTTP 501 until configured.
- [ ] **Install stripe package** — run `npm i stripe` and commit `package.json` / `package-lock.json`. The `api/` functions use a dynamic import so the Vite build succeeds without `stripe` installed.
- [ ] **Webhook** — point a Stripe webhook at `/api/stripe-webhook` (events: `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`) and add `STRIPE_WEBHOOK_SECRET`. Authorization → ride `confirmed`; capture when the dispatcher assigns a driver.
- [ ] **WhatsApp** — add `VITE_WHATSAPP_NUMBER` (digits with country code) to light up "WhatsApp us" links on confirmation and My Trips.
- [ ] **Custom domain** — point your domain to Vercel and update `VITE_SUPABASE_URL` site URL + redirect URLs accordingly.

---

## .env Keys Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key — activates card payment (auth-then-capture) in the booking flow |
| `VITE_MAPBOX_TOKEN` | No | Mapbox token — live address autocomplete (curated places otherwise) |
| `VITE_WHATSAPP_NUMBER` | No | WhatsApp business number — enables "WhatsApp us" deep links |
| `STRIPE_SECRET_KEY` | No (server) | Stripe secret key — activates the payment intent API function |
| `STRIPE_WEBHOOK_SECRET` | No (server) | Stripe webhook signing secret — activates `/api/stripe-webhook` |
| `SUPABASE_URL` | No (server) | Supabase project URL for API functions (falls back to `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | No (server) | Service-role key — server-side ride lookup/status updates |

---

## Tax

A 6% government and facility tax applies to every fare. All fares are shown in Aruban florin (AWG) by default and can be toggled to USD or EUR.
