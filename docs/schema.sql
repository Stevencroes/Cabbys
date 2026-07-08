-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — booking-flow schema migration
-- Run in the Supabase SQL editor. Every statement is idempotent, so the
-- script is safe to re-run. The web app degrades gracefully when columns
-- are missing (tiered inserts), but the full experience needs all of this.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Rides: guest checkout + contact + flight + payment + driver ──
alter table public.rides add column if not exists booking_ref        text;
alter table public.rides add column if not exists contact_name       text;
alter table public.rides add column if not exists contact_phone      text;
alter table public.rides add column if not exists contact_email      text;
alter table public.rides add column if not exists flight_number      text;
alter table public.rides add column if not exists notes              text;
alter table public.rides add column if not exists luggage_count      integer;
alter table public.rides add column if not exists payment_intent_id  text;
alter table public.rides add column if not exists payment_status     text;  -- authorized | paid | failed
-- Driver assignment (surfaced on My Trips once the dispatcher assigns)
alter table public.rides add column if not exists driver_name        text;
alter table public.rides add column if not exists driver_phone       text;
alter table public.rides add column if not exists driver_vehicle     text;
alter table public.rides add column if not exists driver_plate       text;

create index if not exists rides_booking_ref_idx on public.rides (booking_ref);

-- Guest checkout: passenger_id must accept anonymous/absent users.
alter table public.rides alter column passenger_id drop not null;

-- ── 2. Auth: enable anonymous sign-ins ──────────────────────────────
-- Dashboard → Authentication → Providers → Anonymous sign-ins → ON.
-- The web app calls auth.signInAnonymously() when a guest books, so every
-- booking still has an auth.uid() and RLS keeps working. When the guest
-- later creates a real account, Supabase links the anonymous user.

-- ── 3. Row-level security ───────────────────────────────────────────
alter table public.rides enable row level security;

drop policy if exists "rides: insert own"  on public.rides;
create policy "rides: insert own" on public.rides
  for insert to authenticated
  with check (passenger_id = auth.uid() or passenger_id is null);

drop policy if exists "rides: read own" on public.rides;
create policy "rides: read own" on public.rides
  for select to authenticated
  using (passenger_id = auth.uid());

-- Travelers may only cancel their own pending/confirmed rides; every other
-- transition belongs to the driver dashboard (service role bypasses RLS).
drop policy if exists "rides: cancel own" on public.rides;
create policy "rides: cancel own" on public.rides
  for update to authenticated
  using  (passenger_id = auth.uid() and status in ('pending', 'pending_payment', 'confirmed', 'driver_assigned'))
  with check (status = 'cancelled');

-- ── 4. Realtime: live status on My Trips ────────────────────────────
-- Dashboard → Database → Replication → supabase_realtime → add "rides",
-- or:
-- alter publication supabase_realtime add table public.rides;

-- ── 5. Status vocabulary (documentation) ────────────────────────────
-- pending           traveler requested; awaiting authorization/dispatch
-- confirmed         card authorized (webhook) or manually accepted
-- driver_assigned   dispatcher assigned a driver → CAPTURE the PaymentIntent
-- en_route          driver on the way / arrived / passenger on board
-- completed         trip done
-- cancelled         traveler or dispatcher cancelled → VOID the authorization
--
-- Stripe wiring (api/create-payment-intent.ts, api/stripe-webhook.ts):
--   authorize on booking (manual capture) → capture on driver_assigned →
--   cancel/void on cancellation. Configure in Vercel:
--   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
--   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
