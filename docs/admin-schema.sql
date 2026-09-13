-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — admin portal schema
-- Run in the Supabase SQL editor, AFTER docs/schema.sql and
-- docs/driver-schema.sql. Every statement is idempotent, so the script
-- is safe to re-run.
--
-- ── Why this file exists ───────────────────────────────────────────
-- Approving a driver is currently a hand-typed UPDATE. The last section
-- of docs/driver-schema.sql says so out loud:
--
--     update public.drivers set status = 'approved' where user_id = '…';
--
-- That is the whole of Cabby's dispatch tooling. It means the Supabase
-- dashboard is a daily operational dependency, that approving a driver
-- requires somebody who can be trusted with a SQL prompt against the
-- production database, and that the safest possible typo — a missing
-- where clause — approves every driver at once. This file is the
-- minimum that removes the dashboard from day-to-day work: read the
-- drivers, read the rides, change a driver's status, put a driver on a
-- ride. Nothing else.
--
-- ── The problem it has to solve ────────────────────────────────────
-- Every select policy on the two tables an operator needs is written
-- around the signed-in account being the SUBJECT of the row:
--
--     "drivers: read own"       user_id      = auth.uid()
--     "rides: read own"         passenger_id = auth.uid()
--     "rides: read assigned"    driver_id    = auth.uid()
--     "rides: read open pool"   driver_id is null and is_approved_driver()
--
-- An operator is the subject of none of them. Signed in as an owner
-- with no driver row, `select * from drivers` returns zero rows and
-- `select * from rides` returns zero rows — and both come back with NO
-- ERROR, because RLS filters, it does not refuse. That is the exact
-- failure mode this codebase has now spent three sessions fixing on the
-- driver side: an empty result that is really a permission problem, and
-- a screen that says "nothing here" when it means "I couldn't look".
-- So the fix is a real admin concept, not a widened policy.
--
-- ── What this file deliberately does NOT do ────────────────────────
-- It does not touch the service role key, and the admin portal never
-- holds one. A service key bypasses RLS entirely and would have to live
-- in a browser bundle to be useful there, which is the same as
-- publishing it. Everything below runs as the signed-in operator under
-- the anon key, exactly like the driver portal, and every privilege
-- they get is written down here where it can be read.
--
-- It also does not widen or replace a single existing policy. Postgres
-- ORs permissive policies together, so an admin's read is ADDED
-- alongside the driver's and the passenger's. A driver's view of the
-- world is byte-for-byte what it was before this file ran.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Who is an operator ───────────────────────────────────────────
-- A table rather than a column on `drivers`, because an operator is not
-- a kind of driver: Cabby's owner has no vehicle, no plate and no
-- rating, and hanging an `is_admin` boolean off the drivers row would
-- have meant inventing a driver record for a person who never drives —
-- and then keeping that record out of the pool, out of the roster and
-- out of every count of "how many drivers do we have".
--
-- A table also makes the grant auditable in one place: `select * from
-- admins` is the complete answer to "who can approve drivers", and it
-- is three columns wide.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id),
  created_at timestamptz default now()
);

alter table public.admins enable row level security;

-- NO insert, update or delete policy exists on this table, on purpose.
-- Adding an admin is a deliberate act performed in the SQL editor by
-- somebody holding the service role — see section 6. An application
-- path that can create admins is an application path that can be
-- tricked into creating admins, and the whole value of this table is
-- that it cannot be written to from the browser at all.
--
-- Reading your own row is allowed so an operator can confirm the grant
-- landed. It admits exactly one row — nobody, admin or not, can
-- enumerate the others through this policy.
drop policy if exists "admins: read own" on public.admins;
create policy "admins: read own" on public.admins
  for select to authenticated using (user_id = auth.uid());


-- ── 2. is_admin() ───────────────────────────────────────────────────
-- The twin of public.is_approved_driver() in docs/driver-schema.sql,
-- and security definer for the same reason that one is.
--
-- A policy that queries the table it protects recurses. That is not
-- hypothetical here: the obvious way to let operators see each other is
-- to write the policy on `admins` as `using (public.is_admin())`, and
-- the moment somebody does, this function reads `admins`, which fires
-- the policy, which calls this function. Postgres stops it with
-- "infinite recursion detected in policy for relation admins" — every
-- read fails, including the one the whole portal gates on. `security
-- definer` runs the body as the function's OWNER, for whom RLS is not
-- enforced, so the lookup answers instead of recursing.
--
-- It also decouples this answer from whatever policy `admins` happens
-- to carry. Under the read-own policy below an invoker-rights version
-- would work today and start silently answering `false` for everybody
-- the first time that policy is tightened — and "false" here is
-- indistinguishable, from the app's side, from a correct no.
--
-- `stable` so the planner may call it once per statement rather than
-- once per row: the policies below sit on every select against
-- `drivers` and `rides`, and a volatile function there would be a
-- lookup per row scanned.
--
-- `set search_path = public` because a security definer function
-- resolves names with the CALLER's search_path unless it is pinned.
-- Without this line, anyone able to set `search_path` could point
-- `admins` at a table of their own and have this function agree that
-- they are an admin. It is the one line in this file that is purely
-- defensive, and it is not optional.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to authenticated;


-- ── 3. What an operator may READ ────────────────────────────────────
-- Additive. Both policies below sit ALONGSIDE the existing ones rather
-- than replacing them: Postgres ORs permissive policies for the same
-- command, so a row is visible if ANY policy admits it. A driver still
-- sees their own row and their own rides under the driver policies; an
-- admin additionally sees all of both. Nothing that worked before this
-- file stops working, and nothing a driver could not see becomes
-- visible to them.
--
-- Read-only, and that is the whole of it. There is no admin update
-- policy anywhere in this file — see section 4 for why.
drop policy if exists "drivers: read as admin" on public.drivers;
create policy "drivers: read as admin" on public.drivers
  for select to authenticated using (public.is_admin());

drop policy if exists "rides: read as admin" on public.rides;
create policy "rides: read as admin" on public.rides
  for select to authenticated using (public.is_admin());


-- ── 4. Why the writes are functions and not policies ────────────────
-- The same reasoning that produced set_pickup_pin and
-- save_driver_vehicle in docs/driver-schema.sql, and it is worth
-- restating because it is the load-bearing decision in this file.
--
-- An RLS update policy sees the old row in USING and the new row in
-- WITH CHECK, and has no way to compare them — there is no reference to
-- "the value this column had a moment ago" inside WITH CHECK. There is
-- also no column list in RLS: a policy grants UPDATE on the row, not on
-- a column. So a policy permissive enough to let an operator set
-- drivers.status is, by construction, permissive enough to let the same
-- request set drivers.rating, drivers.trips_count, or — on rides —
-- fare_total, payment_intent_id and payment_status. The intended change
-- and the unintended one are the same statement to Postgres.
--
-- A security definer function inverts that. The signature IS the column
-- list: admin_set_driver_status takes a driver and a status, and there
-- is no argument that could carry a fare. What the operator may change
-- is enumerated in SQL rather than hoped for in the client.
--
-- One note on the grants below. Postgres grants EXECUTE on new
-- functions to PUBLIC by default, so `grant execute … to authenticated`
-- is documentation, not a wall. The wall is the `if not is_admin()`
-- line at the top of each function body. Both functions are written so
-- that being called by a non-admin is an ordinary, answered case.


-- ── 4a. admin_set_driver_status ─────────────────────────────────────
-- The statement at the end of docs/driver-schema.sql, with the three
-- things a hand-typed UPDATE does not have: a caller check, a status
-- vocabulary, and a where clause that cannot go missing.
--
-- Returns the number of live rides the driver still holds. Suspending a
-- driver does NOT take their work away — deliberately: a ride silently
-- unassigned at 5am is a guest standing at arrivals waiting for a car
-- that nobody is now driving, which is strictly worse than a suspended
-- driver finishing today's bookings. But the operator has to be TOLD,
-- or the consequence of the tap is invisible until the guest calls. The
-- portal turns this count into a line of prose under the confirmation.
drop function if exists public.admin_set_driver_status(uuid, text);
create function public.admin_set_driver_status(p_driver_user_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
  v_held    integer;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'error', 'not_admin');
  end if;

  -- The same three words the drivers.status check constraint allows. A
  -- fourth would be accepted by this function and then rejected by the
  -- constraint as a raw Postgres error; naming them here means the
  -- refusal is a sentence the portal can show.
  if p_status not in ('pending', 'approved', 'suspended') then
    return json_build_object('ok', false, 'error', 'bad_status');
  end if;

  -- Matches on user_id, never id. drivers.id is the row's own primary
  -- key; drivers.user_id is what points at auth.users, and it is what
  -- rides.driver_id, claim_ride() and every policy in this project key
  -- on. The distinction is called out at the top of
  -- docs/driver-schema.sql because getting it backwards has already
  -- cost this project a silent, total failure once.
  update public.drivers
     set status = p_status
   where user_id = p_driver_user_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'no_driver');
  end if;

  select count(*) into v_held
    from public.rides
   where driver_id = p_driver_user_id
     and status in ('driver_assigned', 'en_route', 'arrived', 'in_progress');

  return json_build_object('ok', true, 'status', p_status, 'held_rides', v_held);
end;
$$;

grant execute on function public.admin_set_driver_status(uuid, text) to authenticated;


-- ── 4b. admin_assign_ride ───────────────────────────────────────────
-- The manual override for when the pool does not clear: a specific
-- driver, on a specific unassigned ride.
--
-- The body is claim_ride() with the actor swapped. claim_ride writes
-- auth.uid() because the driver is claiming for themselves; this writes
-- p_driver_user_id because an operator is placing somebody else. That
-- difference is the only one there should be, and in particular:
--
--   IT STAMPS THE CAR ONTO THE RIDE, THE SAME FIVE COLUMNS,
--   READ THE SAME WAY, IN THE SAME ORDER.
--
-- driver_name / driver_phone / driver_vehicle / driver_plate /
-- driver_photo have been on `rides` since docs/schema.sql, and for most
-- of this project's life NOTHING WROTE THEM. My Trips renders the block
-- behind `{ride.driver_name && …}`, so it drew an empty space and a
-- guest at arrivals had no idea what car to look for. claim_ride was
-- fixed in v7. An assign path that set driver_id and status but skipped
-- the stamp would reintroduce that bug through a second door, and worse
-- than before — because the rides that go through THIS function are by
-- definition the ones a human had to intervene on, which are the ones
-- most likely to be watched.
--
-- The colour leads in the composed vehicle line, because somebody
-- scanning a kerb outside arrivals sees a colour before a badge.
--
-- Narrow on purpose: an unassigned ride only. Reassigning a ride that
-- already has a driver means telling that driver, and a row update is
-- not how somebody finds out their morning changed. The portal offers
-- this control only on rides with no driver, and the function refuses
-- the rest with a reason rather than a row count of zero.
drop function if exists public.admin_assign_ride(uuid, uuid);
create function public.admin_assign_ride(p_ride_id uuid, p_driver_user_id uuid)
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
  v_fallback      text;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'error', 'not_admin');
  end if;

  select status into v_driver_status
    from public.drivers where user_id = p_driver_user_id;

  -- "No such driver" and "that driver isn't approved" are different
  -- mistakes with different fixes — one is the wrong id, the other is a
  -- driver waiting on the very screen the operator just came from.
  if v_driver_status is null then
    return json_build_object('ok', false, 'error', 'no_driver');
  end if;
  if v_driver_status is distinct from 'approved' then
    return json_build_object('ok', false, 'error', 'driver_not_approved');
  end if;

  -- The stamp, read exactly as claim_ride() reads it.
  select
      nullif(btrim(coalesce(d.first_name || ' ', '') || coalesce(d.last_name, '')), ''),
      d.phone,
      nullif(btrim(concat_ws(' ', d.vehicle_colour, d.vehicle_make, d.vehicle_model)), ''),
      d.plate,
      d.photo_url,
      d.vehicle
    into v_name, v_phone, v_vehicle, v_plate, v_photo, v_fallback
    from public.drivers d
   where d.user_id = p_driver_user_id;

  -- Same where clause as claim_ride, and it is still the lock: only an
  -- unclaimed, still-open ride matches, so an operator assigning at the
  -- same moment a driver taps Accept cannot overwrite the claim.
  update public.rides
     set driver_id      = p_driver_user_id,
         status         = 'driver_assigned',
         assigned_at    = now(),
         driver_name    = coalesce(v_name, driver_name),
         driver_phone   = coalesce(v_phone, driver_phone),
         -- the one-line `vehicle` column is the fallback for a driver
         -- whose car predates the structured fields
         driver_vehicle = coalesce(v_vehicle, v_fallback, driver_vehicle),
         driver_plate   = coalesce(v_plate, driver_plate),
         driver_photo   = v_photo
   where id = p_ride_id
     and driver_id is null
     and status in ('confirmed', 'pending');

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Three ways to miss, and the operator needs to know which. A bare
    -- "couldn't assign" sends somebody back to the Supabase dashboard,
    -- which is the thing this file exists to stop.
    if not exists (select 1 from public.rides where id = p_ride_id) then
      return json_build_object('ok', false, 'error', 'no_ride');
    end if;
    if exists (select 1 from public.rides where id = p_ride_id and driver_id is not null) then
      return json_build_object('ok', false, 'error', 'already_taken');
    end if;
    return json_build_object('ok', false, 'error', 'ride_closed');
  end if;

  -- Handing back what was actually stamped lets the portal say "no car
  -- on record" at the moment it matters, instead of leaving it to be
  -- discovered by a guest outside arrivals.
  return json_build_object(
    'ok', true,
    'ride_id', p_ride_id,
    'driver_name', v_name,
    'driver_vehicle', coalesce(v_vehicle, v_fallback),
    'driver_plate', v_plate
  );
end;
$$;

grant execute on function public.admin_assign_ride(uuid, uuid) to authenticated;


-- ── 5. Status vocabulary this file relies on ────────────────────────
-- Nothing new is introduced. admin_set_driver_status writes the three
-- words drivers.status has always allowed (docs/driver-schema.sql §1),
-- and admin_assign_ride writes 'driver_assigned', which docs/schema.sql
-- has defined since the beginning as "dispatcher assigned a driver →
-- CAPTURE the PaymentIntent". That is deliberate: the Stripe webhook
-- already keys on that transition, so a ride assigned by hand through
-- the admin portal captures the same way as one claimed from the pool.


-- ── 6. Make yourself the first admin ────────────────────────────────
-- The one statement that has to be run by hand, and the last one this
-- project should ever need to. There is no way to bootstrap this from
-- the app: a signed-out browser cannot be trusted to nominate the first
-- operator, and an "the first user to ask becomes admin" rule is a race
-- anybody can win.
--
-- Find your uid in Authentication → Users, or run
--   select id, email from auth.users where email = 'you@example.com';
-- then replace the placeholder below and run it in the SQL editor:

-- insert into public.admins (user_id) values ('00000000-0000-0000-0000-000000000000') on conflict do nothing;
