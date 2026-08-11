-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — driver portal schema
-- Run in the Supabase SQL editor, after docs/schema.sql. Every statement
-- is idempotent, so the script is safe to re-run.
--
-- v2 — your `drivers` table already existed (id, user_id, first_name,
-- last_name, phone), which predates this file. `create table if not
-- exists` was therefore a no-op the first time this ran: it neither added
-- the columns below nor changed how identity is checked. This version
-- adapts to your table instead of assuming its shape.
--
-- v3 — `open_rides` already existed too: Postgres refused "create or
-- replace view" with "cannot change name of view column pickup_location
-- to status", which only happens when a view with that shape already
-- exists — and it isn't a shape either version of this file ever
-- defined. Some driver-side SQL predates this project entirely, almost
-- certainly from whichever tool built the original driver app. Rather
-- than reverse-engineer an unknown legacy view, the view and both
-- functions below are dropped and recreated outright: they hold no data
-- of their own, so replacing them is safe regardless of what they looked
-- like before. Only table rows would be worth being careful with, and
-- none are touched here.
--
-- v4 — booked rides never reached the pool. The view was right and the
-- query was right; what was missing was an RLS policy letting a driver
-- read a ride that isn't theirs yet. See section 6.
--
-- The one fact that matters everywhere below: `drivers.id` is the row's
-- own primary key, not the signed-in account. `drivers.user_id` is what
-- points at auth.users. Every check reads user_id, never id.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Columns the portal needs, added to your existing table ───────
alter table public.drivers add column if not exists status      text not null default 'pending'
                            check (status in ('pending', 'approved', 'suspended'));
alter table public.drivers add column if not exists vehicle     text;
alter table public.drivers add column if not exists plate       text;
alter table public.drivers add column if not exists rating      numeric(2,1);
alter table public.drivers add column if not exists trips_count integer not null default 0;
alter table public.drivers add column if not exists is_online   boolean not null default false;

create unique index if not exists drivers_user_id_key on public.drivers (user_id);

-- ── 2. Ride columns the portal needs ────────────────────────────────
-- References auth.users directly, not public.drivers — rides.driver_id
-- is set to auth.uid() by claim_ride() below, and auth.uid() matches
-- drivers.user_id, not drivers.id.
alter table public.rides add column if not exists driver_id    uuid references auth.users (id);
alter table public.rides add column if not exists pickup_lat   double precision;
alter table public.rides add column if not exists pickup_lng   double precision;
-- worth more than the coordinates: "blue umbrella, left of the pier"
alter table public.rides add column if not exists pickup_note  text;
alter table public.rides add column if not exists assigned_at  timestamptz;
alter table public.rides add column if not exists completed_at timestamptz;

create index if not exists rides_driver_id_idx on public.rides (driver_id);
create index if not exists rides_status_idx    on public.rides (status);

-- ── 3. open_rides — what a driver may see BEFORE claiming ───────────
-- Deliberately omits contact_name, contact_phone, contact_email,
-- flight_number, pickup_lat, pickup_lng and pickup_note. Those unlock
-- only once the ride is theirs.
--
-- Column names below are copied from src/lib/bookingPayload.ts, the actual
-- insert code — not guessed. That file's comment explains why several are
-- doubled up: "the production rides table has evolved; not every
-- deployment has every column", so it inserts in three tiers (core →
-- withCoords → full) and a row may only have the earliest tier's columns.
-- pickup_location/dropoff_location, scheduled_date/scheduled_time,
-- vehicle_type and passengers_count are core-tier — always present.
-- scheduled_at, vehicle_class, price and fare_total vary by which tier
-- succeeded; the view passes all of them through raw and the TypeScript
-- mapper (src/driver/lib/driver.ts) does the coalescing, the same way
-- src/pages/MyTrips.tsx already reads this table.
drop view if exists public.open_rides;
create view public.open_rides
with (security_invoker = true) as
  select
    r.id, r.status, r.created_at, r.booking_ref,
    r.pickup_location, r.dropoff_location,
    r.scheduled_date, r.scheduled_time, r.scheduled_at,
    r.vehicle_type, r.vehicle_class,
    r.passengers_count, r.luggage_count, r.child_seats,
    r.price, r.fare_total
  from public.rides r
  where r.driver_id is null
    and r.status in ('confirmed', 'pending');

grant select on public.open_rides to authenticated;

-- ── 4. claim_ride — atomic, and losing is not an error ──────────────
drop function if exists public.claim_ride(uuid);
create function public.claim_ride(p_ride_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_status text;
  v_updated       integer;
begin
  select status into v_driver_status from public.drivers where user_id = auth.uid();

  if v_driver_status is distinct from 'approved' then
    return json_build_object('ok', false, 'error', 'not_approved');
  end if;

  -- the where clause is the lock: only an unclaimed ride matches, so two
  -- drivers tapping at once cannot both win
  update public.rides
     set driver_id   = auth.uid(),
         status      = 'driver_assigned',
         assigned_at = now()
   where id = p_ride_id
     and driver_id is null
     and status in ('confirmed', 'pending');

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'already_taken');
  end if;

  return json_build_object('ok', true, 'ride_id', p_ride_id);
end;
$$;

grant execute on function public.claim_ride(uuid) to authenticated;

-- ── 5. set_ride_status — the driver's only write path ───────────────
drop function if exists public.set_ride_status(uuid, text);
create function public.set_ride_status(p_ride_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_status not in ('en_route', 'arrived', 'in_progress', 'completed') then
    return json_build_object('ok', false, 'error', 'bad_status');
  end if;

  if (select status from public.drivers where user_id = auth.uid()) is distinct from 'approved' then
    return json_build_object('ok', false, 'error', 'not_approved');
  end if;

  update public.rides
     set status       = p_status,
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_ride_id
     and driver_id = auth.uid();

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'not_yours');
  end if;

  return json_build_object('ok', true, 'ride_id', p_ride_id, 'status', p_status);
end;
$$;

grant execute on function public.set_ride_status(uuid, text) to authenticated;

-- ── 6. Row-level security ───────────────────────────────────────────
alter table public.drivers enable row level security;

drop policy if exists "drivers: read own" on public.drivers;
create policy "drivers: read own" on public.drivers
  for select to authenticated using (user_id = auth.uid());

-- A driver may edit their own contact details, never their own status.
drop policy if exists "drivers: update own" on public.drivers;
create policy "drivers: update own" on public.drivers
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and status = (select status from public.drivers where user_id = auth.uid())
  );

-- Assigned rides are readable by the driver who holds them. Writes go
-- through set_ride_status(), which is security definer — there is no
-- update policy for drivers on rides on purpose.
drop policy if exists "rides: read assigned" on public.rides;
create policy "rides: read assigned" on public.rides
  for select to authenticated using (driver_id = auth.uid());

-- v4 — the pool was always empty, and this is why.
--
-- open_rides is `security_invoker = true`, so it reads `rides` as the
-- signed-in driver. The view's own `where driver_id is null` is a filter,
-- not a permission: RLS on the underlying table runs first. Until now the
-- only select a driver had was "rides: read assigned" (driver_id =
-- auth.uid()) — which by definition excludes every unclaimed row — so the
-- open rides were filtered out before the view ever saw them and the Pool
-- screen rendered "Pool's empty" no matter how many rides were waiting.
--
-- This is the policy that admits them: unclaimed, still open, and only
-- for a driver who is actually approved. It grants nothing extra on the
-- rides table itself — a driver querying `rides` directly through this
-- policy sees the same rows the pool does, but the app reads the view,
-- which is what keeps contact details and the pin out of the response.
create or replace function public.is_approved_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drivers
     where user_id = auth.uid() and status = 'approved'
  );
$$;

grant execute on function public.is_approved_driver() to authenticated;

drop policy if exists "rides: read open pool" on public.rides;
create policy "rides: read open pool" on public.rides
  for select to authenticated
  using (
    driver_id is null
    and status in ('confirmed', 'pending')
    and public.is_approved_driver()
  );

-- ── 7. Approve the drivers you already have ─────────────────────────
-- New rows default to 'pending' (line above), so your three existing
-- drivers need approving by hand once:
--   update public.drivers set status = 'approved' where user_id = '<their auth uid>';
-- Find the uid in Authentication → Users, or in this table's user_id
-- column — it's already there for each of your three rows.

-- ── 8. Status vocabulary added by the portal ────────────────────────
-- driver_assigned  claimed, not yet moving        (docs/schema.sql)
-- en_route         heading to pickup              → olive
-- arrived          waiting at pickup              → olive
-- in_progress      passenger aboard               → plum
-- completed        trip done                      (docs/schema.sql)
--
-- 'arrived' and 'in_progress' are new. Anything reading rides.status
-- elsewhere should treat them as "in flight", the same as en_route.
