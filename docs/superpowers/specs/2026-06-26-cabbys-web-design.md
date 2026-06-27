# Cabby's Web — Tourist Booking Webapp — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

A new, standalone Vite + React + TypeScript webapp for one-time tourist bookings,
sharing the **same Supabase backend** as the existing mobile app. Lighter scope: a
polished one-page booking site with lightweight accounts, not a ported mobile app.

---

## 1. Source of truth & key findings

- **Design prototype:** `../Others/cabbys-web-preview.html` is a complete, validated
  prototype of the landing page + 8-step booking overlay + confirmation. We port it
  **1:1** into componentized React + TS. Copy, layout, animations, and brand voice
  are carried over verbatim.
- **Live schema reality (verified against the live project, anon key):**
  - There is **no** `bookings`, `fares`, `vehicles`, or `payments` table.
  - Bookings are rows in **`public.rides`**.
  - Pricing lives in **`pricing_zones`, `pricing_locations`, `pricing_routes`,
    `pricing_addons`, `pricing_config`** (all anon-readable). Confirmed data:
    named bidirectional routes (e.g. Airport→Palm Beach ƒ40), zone fallback,
    `min_fare` ƒ12, `late_night` 23:00–05:00 +15%, `luxury` +40%.
  - Vehicles are **not** a table — `vehicle_type`/`vehicle_class` is free text on the
    ride. The web app keeps vehicles as a local config list; capacity is validated
    client-side.
  - `profiles` and `drivers` tables exist; RLS as-is (do **not** modify schema/RLS).
- **Auth:** the mobile app uses email/password + phone OTP, **not** OAuth. Google/Apple
  are configured in the Supabase dashboard but **currently disabled for testing**.
- **Stripe:** not present anywhere in the existing app; no keys in `.env`.

## 2. Brand system (non-negotiable)

Colors (the only six permitted): midnight `#0A1628`, ocean `#142238`, steel `#2A4A72`,
silver `#B4C3DC`, mist `#EEF2F8`, white `#FFFFFF`. Plus the prototype's helper tints
derived from these (silver-dim, rgba card/border/hairline overlays).

**The prototype's gold accent `#C9A05A` is removed entirely.** Remap:
- diamonds (`.diamond`, `.rdiamond`), step eyebrows, route connector gradient end,
  `.rstep.done` node, confirmation check-ring stroke, `veh-flag` background → **silver**.
- active tiles (`.jt.on`, `.opt.on`, `.veh.on`): silver border + **steel-tinted fill**
  `rgba(42,74,114,0.4)`, matching the existing `.chip.on` pattern.
- `::selection` → steel/silver rgba.

Typography: Cormorant Garamond (300/400) for display/headings/prices; Outfit
(300/400/500/600) for UI/body. Google Fonts import as in the prototype.

Voice: "quiet luxury" — restrained, no exclamation points, no urgency. Tagline
"Arrive in silence." Carry prototype copy verbatim.

Visual details: diamond divider near the wordmark, generous whitespace, low-contrast
borders, glass/blur surfaces (`backdrop-filter: blur`), 16–24px card radii, soft large
shadows.

## 3. Tech & project structure

- React 18 + Vite + TypeScript, React Router.
- `@supabase/supabase-js` pointed at the same project via `.env`
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Deploy: Vercel (separate pipeline from mobile). `vercel.json` SPA rewrite +
  dormant serverless function dir.

```
Cabbys-web/
  index.html                     # fonts preconnect + import, #root
  package.json  vite.config.ts  tsconfig.json  vercel.json  .env  .env.example
  api/
    create-payment-intent.ts     # Vercel function, dormant unless STRIPE_SECRET_KEY set
  src/
    main.tsx                     # Router + providers
    App.tsx                      # routes: / , /trips , /auth/callback
    styles/ tokens.css globals.css
    lib/
      supabase.ts                # createClient
      pricing.ts                 # ported fare engine (TS), reads pricing_* tables
      currency.ts                # AWG base + USD/EUR conversion + symbols
      stripe.ts                  # lazy Stripe.js loader, no-op without publishable key
    data/
      hotels.ts journeys.ts vehicles.ts
    booking/
      BookingContext.tsx         # 8-step state machine + derived validation
      useFare.ts                 # loads pricing + computes live quote
    components/
      Nav.tsx Hero.tsx EntryCard.tsx Ethos.tsx Fleet.tsx Footer.tsx
      Diamond.tsx Icon.tsx
      booking/
        BookingOverlay.tsx ProgressRail.tsx StageFooter.tsx
        steps/ StepJourney StepRoute StepSchedule StepParty
               StepVehicle StepQuote StepAccount StepPayment
      Confirmation.tsx CurrencyToggle.tsx Stepper.tsx
    pages/
      Landing.tsx MyTrips.tsx AuthCallback.tsx
```

## 4. Booking flow (8 steps — names match mobile)

`Occasion → Route → Schedule → Party → Vehicle → Fare → Account → Payment`, driven by
`BookingContext`. Mirrors the prototype exactly:

1. **Journey type** — Airport / Hotel-to-hotel / Beach / Dining / Custom.
2. **Route** — fixed hotel list (Renaissance, Manchebo, Hilton, Hyatt, Marriott,
   Ritz-Carlton) + Queen Beatrix Airport + custom free-text for pickup and drop-off.
3. **Schedule** — date + time, quick-choice presets.
4. **Party** — passengers + luggage steppers.
5. **Vehicle** — config list (Executive Sedan, Premium Sedan, Luxury SUV, Private Van);
   cars too small for the party are disabled (capacity validation).
6. **Fare** — live AWG quote from the real engine, with AWG/USD/EUR toggle; 6%
   government & facility tax shown in the summary.
7. **Account** — `signInWithOAuth` Google/Apple (redirect to `/auth/callback`) **plus**
   an email magic-link (`signInWithOtp`) fallback so the flow is testable while OAuth
   is disabled.
8. **Payment** — "reserve now" mode: on confirm, insert the booking into `rides`.
   Stripe Payment Element renders only when `VITE_STRIPE_PUBLISHABLE_KEY` is set.

Confirmation: dark midnight screen, animated check-ring (silver), glass card rising
from the bottom — as in the prototype.

## 5. Pricing engine

Port `../Others/src/pricing.js` to `lib/pricing.ts` with types, unchanged logic:
`loadPricing(island='aruba')` (cached) reads the five `pricing_*` tables;
`computeFare({pickup, dropoff, addonKeys, extraStops, when, luxury})` returns
`{ base, total, lineItems, source }` in AWG (florin). Late-night and luxury are
percent multipliers from `pricing_addons`; `min_fare` enforced.

`currency.ts`: base AWG, `RATES = { AWG:1, USD:1/1.79, EUR:1/1.97 }`,
`SYMBOL = { AWG:'ƒ', USD:'$', EUR:'€' }`. **Tax:** 6% shown as a summary line on top of
the engine subtotal (the engine total is pre-tax; tourist quote adds the 6% line, total
incl. tax) — matching the prototype's `TAX_RATE = 0.06`.

## 6. Booking write (`public.rides`)

Mirror the mobile insert (App.jsx ~line 2024), including the `withCoords → core`
fallback so it works whether or not optional columns exist:

```
core = { passenger_id, pickup_location, dropoff_location,
         scheduled_date, scheduled_time, vehicle_type, passengers_count,
         price, addons, status:'pending' }
withCoords = { ...core, scheduled_at, is_asap, vehicle_class,
               fare_base, fare_discount, fare_total,
               pickup_lat, pickup_lng, dropoff_lat, dropoff_lng }
```

Insert `withCoords`; on error, retry `core`; on success, show Confirmation with the
returned `rides.id` as the reference.

## 7. Auth

`onAuthStateChange` + `getSession` drive a lightweight auth state. `signInWithOAuth`
for Google/Apple with `redirectTo` `/auth/callback`; `AuthCallback` finishes the
session and returns to the in-progress booking. Email magic-link fallback via
`signInWithOtp` for testing while providers are disabled. Sign-in is required only to
move past the Account step (booking must have a `passenger_id`).

## 8. My Trips

`/trips`: read `rides` for the signed-in `passenger_id`, ordered by `created_at` desc;
render as brand-styled summary cards (route, date/time, vehicle, fare, status). No deep
history/tracking — just the list.

## 9. Stripe (dormant)

`api/create-payment-intent.ts` Vercel function returns 501 unless `STRIPE_SECRET_KEY`
is set; when set, creates a PaymentIntent for the AWG-equivalent amount. `lib/stripe.ts`
loads Stripe.js only when `VITE_STRIPE_PUBLISHABLE_KEY` exists; otherwise `StepPayment`
renders the reserve-now UI. No schema, no `payments` table.

## 10. Out of scope (YAGNI)

Saved places, ride history depth, live driver tracking, phone OTP, driver/admin
surfaces, any schema or RLS changes, real card capture until keys are provided.

## 11. Deliverable order

1. Scaffold + tokens + landing page (Nav/Hero/EntryCard/Ethos/Fleet/Footer) — the
   reviewable artifact.
2. Booking overlay + 8 steps + live fare engine (real pricing data).
3. Auth + booking write to `rides` + confirmation.
4. My Trips + Stripe scaffold + Vercel deploy config.

---

## Addendum (2026-06-27): Color-zoned sections

Brings more of the brand palette into the UI by giving sections distinct, low-opacity
blue zones instead of one uniform dark field. **No new hues** — all tones are
steel/ocean rgba helper tints already permitted by §2. Diamonds, eyebrows, and type
remain silver/mist/white; text contrast is unchanged.

**Vertical rhythm** down the page: `midnight (hero) → steel-tinted (ethos) → deep
ocean (fleet) → midnight (footer)`. Steel (`#2A4A72`), the most underused brand color,
surfaces as the warm midpoint.

New tokens in `tokens.css`:
- `--zone-ethos` — ocean→steel-tinted band + faint steel radial glow (the colorful zone)
- `--zone-fleet` — deep-ocean band, darker/quieter than ethos
- `--steel-edge` — `rgba(42,74,114,…)` for card left-accents / top-stripes

Surfaces:
- **Hero** — unchanged (darkest arrival point).
- **Ethos** — full-bleed steel-tinted band, top hairline marks the zone change; `.ecard`
  gains a steel left-edge + steel-tinted icon tile.
- **Fleet** — full-bleed deep-ocean band; `.fcard` gains a thin steel top-stripe.
- **Booking overlay** — keeps rail(midnight)/stage(ocean) split, strengthened as zoning:
  steel radial glow in the stage; quote + payment-summary cards get a steel-tinted
  header band.
- **My Trips** — steel radial glow on the page background; ride cards gain a steel
  left-edge accent (stronger on hover).

Guardrails: steel bands ~8–14% over ocean; restraint and quiet-luxury voice intact.

### v2 (2026-06-27): bold solid fills + dark/light rotation

Per the brand PDF (`Cabbys_Brand_Identity.pdf`) — which confirms the same six colors
and shows them as **solid blocks** (silver "Confirm & Pay" button, midnight/white/steel/
silver wordmark blocks). Goal: use brand colors as real fills and rotate them, not just
tint text.

- **Primary buttons → solid silver, midnight text** (`.entry-cta`, `.btn-primary` →
  covers StageFooter, StepRide, Confirmation/conf-done, pay-confirm). Hover brightens to
  `--silver-hi`. Mirrors the PDF's Confirm & Pay.
- **Selected states → solid steel blocks** — `--accent-soft` is now solid `#2A4A72`
  (was 40% rgba); hardcoded `.chip.on` / `.cur-toggle .on` made solid too.
- **Ethos is now the LIGHT zone** — mist surface (`--zone-light`) with white cards,
  midnight headings, `--ink` body text. Page rhythm: `midnight (hero) → LIGHT mist
  (ethos) → ocean (fleet) → midnight (footer)`.
- **Color rotation across repeated elements** — Ethos icon tiles cycle solid
  steel → silver → ocean; Fleet card top-stripes alternate steel / silver (`nth-child`).

New tokens: `--silver-hi` (button hover), `--ink` (light-surface body text),
`--zone-light` (mist section background).
