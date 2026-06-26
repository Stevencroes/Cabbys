# Cabby's Web — Quick Booking Redesign (8 steps → 3 screens)

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

Replace the 8-step booking wizard with a fast, Uber-style flow: a destination-first
"Where to?" entry with grouped place categories and free typing, then a ride/price
screen, then confirm. Same Supabase backend, same fare engine, same `rides` write.

---

## 1. Motivation

The current overlay walks through eight steps (Occasion, Route, Schedule, Party,
Vehicle, Fare, Account, Payment). For a one-time tourist booking that is too long.
Tourists want to type or pick where they're going, see a price, and confirm — the
Uber rider pattern (destination-first → see prices → confirm).

## 2. New flow — three screens

`Trip → Ride → Confirm` (BookingContext reduced to 3 steps; `STEP_NAMES =
['Trip','Ride','Confirm']`).

### Screen 1 — Trip
- **Destination-first.** A "Where to?" search field at the top accepts free typing.
- **Category quick-picks** below the field: **Airport · Hotels · Beaches · Dining ·
  Sights.** Tapping a category reveals its curated places; tapping a place fills the
  active location field.
- **Pickup & destination:** both `From` and `To` use the same place picker / search.
  **No default pickup** — `From` starts empty and the user must set it. The screen
  leads with `To` ("Where to?"); `From` is a secondary field.
- **When:** compact control — `Now` or `Schedule` (date + time). Late-night surcharge
  still applies via the engine.
- **Guests / Bags:** compact `Stepper`s for passengers (min 1) and luggage (min 0).
- Replaces the old *Occasion, Route, Schedule, Party* steps. The journey "type" is
  gone — it is implied by the chosen category.
- **Continue gate:** `from` and `to` both set, a valid `when` (date+time, or Now),
  passengers ≥ 1.

### Screen 2 — Ride
- Uber-style vehicle list with per-car fixed fares, capacity-filtered via `fitsParty`.
- Fare summary with line items and the **6% government & facility tax** line.
- Merges old *Vehicle + Fare*. **Continue gate:** a vehicle is selected.

### Screen 3 — Confirm
- Sign in (Google / Apple / email magic-link) if not already signed in, then reserve.
- Writes the booking to `public.rides` (unchanged `withCoords → core` fallback) and
  shows the existing animated Confirmation screen. Merges old *Account + Payment*.
- **Continue gate:** signed in (real `useAuth().user`, synced to `state.signedIn`).

## 3. Currency — USD only

- **All fares display in USD.** Remove the AWG/EUR currency toggle and the
  `CurrencyToggle` component from the flow.
- The fare engine still computes in AWG (florin) internally; the UI converts to USD
  for display via `currency.ts` (`formatMoney(awg, "USD")`, `RATES.USD = 1/1.79`).
- `state.currency` is dropped (or fixed to `"USD"`); no per-booking currency choice.
- `currency.ts` keeps `convert`/`formatMoney`/`RATES`/`SYMBOL` (AWG/EUR remain in the
  module, simply unused by the UI) — no need to delete them.

## 4. Pricing honesty (driven by the engine's `source`)

`computeFare` returns `source: "route" | "zone" | "min"`:
- `"route"` or `"zone"` → label the fare **"Fixed fare"** (an exact, known price).
- `"min"` (fallback, i.e. the engine couldn't match a route or zone) → label it
  **"Estimate · confirmed by your driver."**

This makes the fixed-price promise honest: curated places that resolve to a real
route/zone show an exact fare; freely-typed unknown addresses that only hit the
minimum-fare fallback are shown as estimates. No hardcoded per-place flags.

## 5. Curated destination catalog

New `src/data/places.ts`: places grouped by category, each `{ id, name, category,
zone, meta? }`, with `name` matching `pricing_locations` where a row exists so the
engine resolves a real zone/route fare.

- **Airport:** Queen Beatrix International Airport.
- **Hotels:** the existing six (reuse current `hotels.ts` data — Renaissance,
  Manchebo, Hilton, Hyatt, Marriott, The Ritz-Carlton).
- **Beaches:** Eagle Beach, Palm Beach, Baby Beach (+ Arashi / Boca Catalina if they
  resolve to a zone).
- **Dining:** Carte Blanche, Papiamento (from the mobile `experiences.js`).
- **Sights:** California Lighthouse (+ others that map to a zone).

`Category = 'airport' | 'hotels' | 'beaches' | 'dining' | 'sights'`. Hotels carry
their existing zones; new entries get a `zone` based on their area (most are zone A —
Noord/Palm/Oranjestad). Entries that don't resolve to a route/zone simply price via
the `"min"` fallback and show the estimate label (§4) — acceptable, not a blocker.

## 6. Components

**New**
- `src/data/places.ts` — the curated catalog + a `Category` type + helpers
  (`placesByCategory`, `CATEGORIES` with labels/icons).
- `src/components/booking/DestinationField.tsx` — search input + category quick-picks
  + curated place list; writes to the active location (`from` or `to`).
- `src/components/booking/steps/StepTrip.tsx` — Screen 1 (destination + pickup +
  when + guests).
- `src/components/booking/steps/StepRide.tsx` — Screen 2 (vehicle list + fare summary,
  USD).
- `src/components/booking/steps/StepConfirm.tsx` — Screen 3 (account + reserve).

**Reused as-is**
- `lib/pricing.ts`, `lib/currency.ts` (USD path), `data/vehicles.ts` + `fitsParty`,
  `lib/bookingPayload.ts`, `booking/useFare.ts`, `booking/useAuth.ts`,
  `components/Confirmation.tsx`, the `rides` write, `components/Stepper.tsx`, and the
  OAuth/email building blocks (lifted from `StepAccount`).

**Changed**
- `src/booking/BookingContext.tsx` — reduce to 3 steps; new `STEP_NAMES`; rework
  `canContinue` per §2; drop `currency`/`journey` fields (journey no longer used).
  Keep `from/to/fromCustom/toCustom/date/time/passengers/luggage/vehicle/signedIn`.
- `src/components/booking/BookingOverlay.tsx` — render the 3 new steps; "Step N of 3";
  progress rail shows 3 nodes.
- `src/components/EntryCard.tsx` — the journey chips become **category quick-picks**;
  selecting a category (or Begin) opens the overlay on Screen 1.

**Removed (folded into the 3 screens)**
- `StepJourney`, `StepRoute`, `StepSchedule`, `StepParty`, `StepVehicle`, `StepQuote`,
  `StepAccount`, `StepPayment`, `CurrencyToggle` — salvage their inner markup/logic
  into the new screens, then delete the obsolete files and their tests.

## 7. Brand & voice (unchanged constraints)

Strict six-color palette (no gold, no other off-palette hex); Cormorant Garamond +
Outfit; quiet-luxury copy with no exclamation points; glass/blur surfaces, diamond
accents, generous whitespace. The screens stay calm and uncluttered despite holding
more per screen.

## 8. Out of scope (YAGNI)

Real geocoding/autocomplete from a maps API (no map provider wired); saved/recent
places; multi-currency; any schema/RLS change. Free typing matches against the curated
catalog and otherwise prices via the `min` fallback with the estimate label.

## 9. Testing

- `places.ts`: catalog grouping + that hotel names still match the pricing data.
- `BookingContext`: the new 3-step `canContinue` gates (Trip needs from+to+when+pax;
  Ride needs vehicle; Confirm needs signedIn).
- `DestinationField`: typing filters/sets the active location; category tap reveals
  places; picking a place writes `from`/`to`.
- `StepRide`: fare shows in USD; capacity disables small cars; "Estimate" label appears
  when `source === "min"`, "Fixed fare" otherwise.
- `StepConfirm` / booking write: insert into `rides` still fires with the right payload;
  confirmation surfaces the ride id; `reset()` on done.
- Whole suite stays green and pristine; `npm run build` clean; no off-palette hex.

## 10. Migration note

This is a UI/flow refactor only — no Supabase schema, RLS, or pricing-data changes.
The `rides` insert payload is unchanged.
