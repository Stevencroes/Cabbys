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
create or replace view public.open_rides
with (security_invoker = true) as
  select
    r.id, r.status, r.scheduled_at, r.pickup, r.dropoff,
    r.vehicle, r.passengers, r.luggage_count, r.child_seats,
    r.fare_total, r.booking_ref, r.created_at
  from public.rides r
  where r.driver_id is null
    and r.status in ('confirmed', 'pending');

grant select on public.open_rides to authenticated;

-- ── 4. claim_ride — atomic, and losing is not an error ──────────────
create or replace function public.claim_ride(p_ride_id uuid)
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
create or replace function public.set_ride_status(p_ride_id uuid, p_status text)
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
