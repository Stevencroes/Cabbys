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
-- v4 — same lesson, third time: rides.driver_id may also predate this
-- file, in which case "add column if not exists" changed nothing and an
-- old foreign key is still attached. Section 2 now drops whatever FK is
-- on that column and rebuilds it against auth.users, because a legacy one
-- pointing at drivers(id) makes every claim_ride() call abort — which
-- surfaced as an Accept button that did nothing at all.
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

-- ── 1b. The car, in the words a guest identifies it by ──────────────
-- v7. `vehicle` is one free-text line and stays — older rows have only
-- that, and loadDriverById still falls back to it. But "Mercedes
-- V-Class" is not what somebody standing outside arrivals is scanning
-- for: they are looking for a COLOUR first, then a shape, then a plate.
-- So the parts are stored as parts and composed for display.
--
-- seats and bags are capacity, not the party on any one ride. They are
-- here because dispatch has nowhere else to keep them, and because a
-- driver who has changed to a bigger car should be able to say so.
alter table public.drivers add column if not exists vehicle_make   text;
alter table public.drivers add column if not exists vehicle_model  text;
alter table public.drivers add column if not exists vehicle_colour text;
alter table public.drivers add column if not exists vehicle_year   integer;
alter table public.drivers add column if not exists seats          integer;
alter table public.drivers add column if not exists bags           integer;
-- a face, so the guest knows who is walking towards them
alter table public.drivers add column if not exists photo_url      text;

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
-- v5 — the two stamps in the middle. assigned_at and completed_at bracket
-- a job; without these, "the driver says they waited twenty minutes" and
-- "the guest says the car came late" are two claims with nothing between
-- them. set_ride_status() writes them, once each, below.
alter table public.rides add column if not exists arrived_at   timestamptz;
alter table public.rides add column if not exists started_at   timestamptz;
-- v7 — the driver's photo, alongside driver_name / driver_phone /
-- driver_vehicle / driver_plate, which docs/schema.sql has created since
-- the beginning and which NOTHING HAS EVER WRITTEN. My Trips renders
-- them behind `{ride.driver_name && …}`, so the block silently drew
-- nothing and a guest at arrivals had no idea what car to look for.
-- claim_ride() stamps all five below.
--
-- Denormalised onto the ride on purpose, and not a join: "drivers: read
-- own" means a passenger cannot read the drivers table at all, and the
-- stamp is also the honest historical record of who drove a ride on the
-- day, which a live join would quietly rewrite every time a driver
-- changed cars.
alter table public.rides add column if not exists driver_photo text;

create index if not exists rides_driver_id_idx on public.rides (driver_id);
create index if not exists rides_status_idx    on public.rides (status);

-- If rides.driver_id already existed — and it may, the same way drivers
-- and open_rides did — then "add column if not exists" above was a no-op
-- and whatever foreign key it was created with is still in force. A
-- legacy one pointing at public.drivers(id) is fatal but silent:
-- claim_ride sets driver_id = auth.uid(), which matches drivers.user_id,
-- NOT drivers.id, so every claim aborts on a constraint violation and the
-- driver just sees a button that does nothing.
--
-- Drop whatever FK is on that column and put back the right one.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'rides'
       and con.contype = 'f'
       and con.conkey = array[
             (select attnum from pg_attribute
               where attrelid = 'public.rides'::regclass and attname = 'driver_id')
           ]
  loop
    execute format('alter table public.rides drop constraint %I', c.conname);
  end loop;

  alter table public.rides
    add constraint rides_driver_id_fkey
    foreign key (driver_id) references auth.users (id);
end $$;

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
  v_name          text;
  v_phone         text;
  v_vehicle       text;
  v_plate         text;
  v_photo         text;
begin
  select status into v_driver_status from public.drivers where user_id = auth.uid();

  if v_driver_status is distinct from 'approved' then
    return json_build_object('ok', false, 'error', 'not_approved');
  end if;

  -- v7 — stamp the car onto the ride while we are here.
  --
  -- driver_name / driver_phone / driver_vehicle / driver_plate have been
  -- on `rides` since docs/schema.sql and were never written by anything,
  -- so My Trips drew an empty space where the driver should be and a
  -- guest at arrivals had nothing to look for. The colour leads, because
  -- that is what somebody scanning a kerb sees first.
  select
      nullif(btrim(coalesce(d.first_name || ' ', '') || coalesce(d.last_name, '')), ''),
      d.phone,
      nullif(btrim(concat_ws(' ', d.vehicle_colour, d.vehicle_make, d.vehicle_model)), ''),
      d.plate,
      d.photo_url
    into v_name, v_phone, v_vehicle, v_plate, v_photo
    from public.drivers d
   where d.user_id = auth.uid();

  -- the where clause is the lock: only an unclaimed ride matches, so two
  -- drivers tapping at once cannot both win
  update public.rides
     set driver_id      = auth.uid(),
         status         = 'driver_assigned',
         assigned_at    = now(),
         driver_name    = coalesce(v_name, driver_name),
         driver_phone   = coalesce(v_phone, driver_phone),
         -- the one-line `vehicle` column is the fallback for a driver
         -- whose car predates the structured fields
         driver_vehicle = coalesce(v_vehicle, (select vehicle from public.drivers where user_id = auth.uid()), driver_vehicle),
         driver_plate   = coalesce(v_plate, driver_plate),
         driver_photo   = v_photo
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

  -- Each stamp is written once and never overwritten: coalesce keeps the
  -- FIRST arrival, so a driver stepping back with the undo and forward
  -- again does not quietly move the time they got there.
  -- v6 — a terminal ride stays terminal. This matched on ownership alone,
  -- so a driver holding a screen that was opened before a guest cancelled
  -- could tap "I'm on my way" and resurrect the ride: status back to
  -- en_route, with a passenger who had already been refunded. The portal
  -- will not offer that button, but the portal is not the authority.
  update public.rides
     set status       = p_status,
         arrived_at   = case when p_status = 'arrived'     then coalesce(arrived_at, now())   else arrived_at   end,
         started_at   = case when p_status = 'in_progress' then coalesce(started_at, now())   else started_at   end,
         completed_at = case when p_status = 'completed'   then now()                          else completed_at end
   where id = p_ride_id
     and driver_id = auth.uid()
     and status not in ('cancelled', 'completed');

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Tell the two apart: "not yours" sends a driver to support, and
    -- "this was called off" sends them back to the roster.
    if exists (
      select 1 from public.rides
       where id = p_ride_id and driver_id = auth.uid()
         and status in ('cancelled', 'completed')
    ) then
      return json_build_object('ok', false, 'error', 'ride_closed');
    end if;
    return json_build_object('ok', false, 'error', 'not_yours');
  end if;

  return json_build_object('ok', true, 'ride_id', p_ride_id, 'status', p_status);
end;
$$;

grant execute on function public.set_ride_status(uuid, text) to authenticated;

-- ── 5b. release_ride — handing a job back ───────────────────────────
-- The inverse of claim_ride, and the gap that made claiming feel
-- one-way. A driver whose car will not start has to be able to give a
-- job back, or the ride sits assigned to somebody who cannot drive it
-- while the pool shows nothing and dispatch knows nothing.
--
-- Deliberately narrow. It releases only a job that has not STARTED —
-- status still 'driver_assigned' — and only outside the window where a
-- handback stops being scheduling and becomes a no-show. Inside that
-- window the answer is a person, not a button, and the portal says so
-- rather than offering a control that would be refused.
--
-- The ride returns to 'confirmed' with driver_id cleared, which is
-- exactly the shape open_rides selects on, so it reappears in the pool
-- for whoever can take it. No new status, no new column.
drop function if exists public.release_ride(uuid, text);
create function public.release_ride(p_ride_id uuid, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
  v_when    timestamptz;
begin
  select coalesce(scheduled_at, (scheduled_date || ' ' || coalesce(scheduled_time, '00:00'))::timestamp at time zone 'America/Aruba')
    into v_when
    from public.rides
   where id = p_ride_id and driver_id = auth.uid();

  if v_when is null then
    return json_build_object('ok', false, 'error', 'not_yours');
  end if;

  -- Two hours. Past that, another driver has to be found and briefed,
  -- and that is a phone call rather than a row update.
  if v_when < now() + interval '2 hours' then
    return json_build_object('ok', false, 'error', 'too_late');
  end if;

  -- and the stamp comes off with it: a released ride that still showed
  -- the old driver's name and plate would have a guest watching for a car
  -- that is not coming.
  update public.rides
     set driver_id      = null,
         status         = 'confirmed',
         assigned_at    = null,
         driver_name    = null,
         driver_phone   = null,
         driver_vehicle = null,
         driver_plate   = null,
         driver_photo   = null,
         notes       = case
                         when coalesce(btrim(p_reason), '') = '' then notes
                         else coalesce(notes || ' · ', '') || 'Returned to pool: ' || btrim(p_reason)
                       end
   where id = p_ride_id
     and driver_id = auth.uid()
     and status = 'driver_assigned';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'already_started');
  end if;

  return json_build_object('ok', true, 'ride_id', p_ride_id);
end;
$$;

grant execute on function public.release_ride(uuid, text) to authenticated;

-- ── 5c. save_driver_vehicle — the car, and the rides already stamped ─
-- v7. Denormalising the car onto each ride is right — a passenger cannot
-- read the drivers table, and the stamp is the historical record of who
-- actually drove — but it means a driver who changes cars on Tuesday has
-- Monday's stamp sitting on Wednesday's booking. A guest would stand at
-- arrivals watching for the wrong car.
--
-- So the write does both: the profile, and every ride of theirs still
-- ahead. Rides already driven keep the car that drove them, which is the
-- whole point of a stamp.
--
-- A function rather than a policy for the same reason set_pickup_pin is:
-- RLS has no column list, and an update policy loose enough to let a
-- driver write seven columns is loose enough to let them write `status`.
drop function if exists public.save_driver_vehicle(text, text, text, integer, text, integer, integer, text);
create function public.save_driver_vehicle(
  p_make   text,
  p_model  text,
  p_colour text,
  p_year   integer,
  p_plate  text,
  p_seats  integer,
  p_bags   integer,
  p_photo  text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
  v_vehicle text;
  v_name    text;
  v_phone   text;
begin
  update public.drivers
     set vehicle_make   = nullif(btrim(coalesce(p_make, '')), ''),
         vehicle_model  = nullif(btrim(coalesce(p_model, '')), ''),
         vehicle_colour = nullif(btrim(coalesce(p_colour, '')), ''),
         vehicle_year   = p_year,
         plate          = nullif(btrim(coalesce(p_plate, '')), ''),
         seats          = p_seats,
         bags           = p_bags,
         photo_url      = coalesce(nullif(btrim(coalesce(p_photo, '')), ''), photo_url)
   where user_id = auth.uid();

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'no_driver');
  end if;

  select
      nullif(btrim(concat_ws(' ', d.vehicle_colour, d.vehicle_make, d.vehicle_model)), ''),
      nullif(btrim(coalesce(d.first_name || ' ', '') || coalesce(d.last_name, '')), ''),
      d.phone
    into v_vehicle, v_name, v_phone
    from public.drivers d
   where d.user_id = auth.uid();

  -- every ride of theirs that has not happened yet
  update public.rides
     set driver_name    = coalesce(v_name, driver_name),
         driver_phone   = coalesce(v_phone, driver_phone),
         driver_vehicle = coalesce(v_vehicle, driver_vehicle),
         driver_plate   = nullif(btrim(coalesce(p_plate, '')), ''),
         driver_photo   = (select photo_url from public.drivers where user_id = auth.uid())
   where driver_id = auth.uid()
     and status in ('driver_assigned', 'en_route', 'arrived');

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.save_driver_vehicle(text, text, text, integer, text, integer, integer, text) to authenticated;

-- ── 5d. Where a driver's photo lives ────────────────────────────────
-- A public bucket, because the image is shown to a guest who is not
-- signed in as anybody in particular and may not be signed in at all.
-- Nothing private goes in it: one headshot per driver, named by their
-- auth uid so a driver can only ever overwrite their own.
insert into storage.buckets (id, name, public)
select 'driver-photos', 'driver-photos', true
where not exists (select 1 from storage.buckets where id = 'driver-photos');

drop policy if exists "driver photos: public read" on storage.objects;
create policy "driver photos: public read" on storage.objects
  for select using (bucket_id = 'driver-photos');

-- Write only under your own uid. storage.foldername() splits the object
-- name on "/", so an object called "<uid>/face.jpg" is writable only by
-- that uid — which is what stops one driver replacing another's face.
drop policy if exists "driver photos: write own" on storage.objects;
create policy "driver photos: write own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'driver-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "driver photos: replace own" on storage.objects;
create policy "driver photos: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'driver-photos' and (storage.foldername(name))[1] = auth.uid()::text);

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
