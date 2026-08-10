-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — driver portal schema
-- Run in the Supabase SQL editor, after docs/schema.sql. Every statement
-- is idempotent, so the script is safe to re-run.
--
-- The driver brief assumed this was already migrated. It is not present in
-- this project, so it is written here to the contract the portal expects:
--   open_rides            claimable jobs, with the passenger's identity and
--                         the pin deliberately withheld
--   claim_ride()          atomic accept; loses the race politely
--   set_ride_status()     the only way a driver moves a ride forward
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Drivers ──────────────────────────────────────────────────────
create table if not exists public.drivers (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null default '',
  phone        text,
  vehicle      text,
  plate        text,
  -- the approval gate reads this; anything but 'approved' locks the portal
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'suspended')),
  rating       numeric(2,1),
  trips_count  integer not null default 0,
  is_online    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ── 2. Ride columns the portal needs ────────────────────────────────
alter table public.rides add column if not exists driver_id    uuid references public.drivers (id);
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
  select status into v_driver_status from public.drivers where id = auth.uid();

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

  if (select status from public.drivers where id = auth.uid()) is distinct from 'approved' then
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
  for select to authenticated using (id = auth.uid());

-- A driver may edit their own contact details, never their own status.
drop policy if exists "drivers: update own" on public.drivers;
create policy "drivers: update own" on public.drivers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and status = (select status from public.drivers where id = auth.uid()));

-- Assigned rides are readable by the driver who holds them. Writes go
-- through set_ride_status(), which is security definer — there is no
-- update policy for drivers on rides on purpose.
drop policy if exists "rides: read assigned" on public.rides;
create policy "rides: read assigned" on public.rides
  for select to authenticated using (driver_id = auth.uid());

-- ── 7. Status vocabulary added by the portal ────────────────────────
-- driver_assigned  claimed, not yet moving        (docs/schema.sql)
-- en_route         heading to pickup              → olive
-- arrived          waiting at pickup              → olive
-- in_progress      passenger aboard               → plum
-- completed        trip done                      (docs/schema.sql)
--
-- 'arrived' and 'in_progress' are new. Anything reading rides.status
-- elsewhere should treat them as "in flight", the same as en_route.
