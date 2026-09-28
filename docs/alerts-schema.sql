-- ═══════════════════════════════════════════════════════════════════════
--  Cabby's — booking emails: nobody drives a booking nobody knows about,
--  and every guest gets their booking in writing
--  Run this whole file in the Supabase SQL editor. It is idempotent.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Four emails, sent by api/booking-alerts.ts through Resend. Three to
-- Cabby's:
--
--   new         the moment a booking is made
--   remind_12h  12 hours before pickup, if nobody is driving it yet
--   remind_2h    2 hours before pickup, if STILL nobody is driving it
--
-- and two to the guest, at the address they gave:
--
--   guest_confirmation  the moment it is made — their booking in writing.
--                       The confirmation screen has said "a copy is on its
--                       way to your email" since before anything sent one.
--   driver_assigned     when a driver takes the ride — who, in what car,
--                       with which plate. Once per ASSIGNMENT, not per
--                       ride: a driver who hands a ride back and a second
--                       who takes it means a guest told the wrong name,
--                       so the second assignment sends "your driver has
--                       changed". Never the driver's phone number: My trips
--                       shows it from two hours before pickup, and an email
--                       would hand it out days early and keep it forever.
--
-- A single email is easy to miss, and a missed one is a guest standing
-- at the airport. The reminders are what turn "we sent an alert" into
-- "somebody noticed". They stop by themselves the moment a driver is on
-- the ride or it is cancelled, because each one is only due while the
-- ride still needs a driver.
--
-- ── How the pieces fit ────────────────────────────────────────────────
--
--   booking inserted ──trigger──┐
--                               ├──► POST cabbystransfer.com/api/booking-alerts
--   every 15 minutes ───cron────┘            │
--                                            ├─► claim_booking_alerts()  what is due, claimed once
--                                            ├─► Resend                  the email
--                                            └─► finish_booking_alert()  sent, or failed and retried
--
-- The trigger is only a nudge so the first email arrives in seconds. The
-- cron is the real guarantee: it sends whatever is due and not yet sent,
-- so a nudge lost to a cold start or a network blip costs fifteen
-- minutes, not the alert.
--
-- The DATABASE decides what is due. The function only writes and sends
-- the emails. That keeps the rule in one place, next to the data, where
-- two overlapping runs cannot both decide to send the same email:
-- claiming is one INSERT ... ON CONFLICT, and only one of them wins it.
--
-- ── The secret ────────────────────────────────────────────────────────
--
-- The trigger and the cron prove they are the ones calling by sending a
-- random secret, generated below and kept in Supabase Vault. The Vercel
-- function does not hold a copy: it passes on whatever it was sent, and
-- the two RPCs here check it. So nobody ever types, pastes or rotates it
-- by hand, and a stranger calling the endpoint gets 'bad_secret' back and
-- sends nothing.
--
-- The only key the function needs is Resend's (RESEND_API_KEY in Vercel).
-- It reads the database with the public key the site already ships,
-- because these two RPCs are the whole of what it may do.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── 1. somewhere PostgREST does not publish ───────────────────────────
-- Everything in `public` is callable through the API by default. The
-- helpers that read the secret must not be, so they live here.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ── 2. the secret ─────────────────────────────────────────────────────
-- Two random UUIDs, 244 bits between them, made here so it never passes
-- through anyone's clipboard. Created once; re-running keeps it.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'booking_alerts_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'booking_alerts_secret',
      'Proves a call to /api/booking-alerts came from this database. See docs/alerts-schema.sql.'
    );
  end if;
end $$;

create or replace function private.alerts_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = 'booking_alerts_secret' limit 1
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default. `from public` does not undo that; naming them does.
revoke all on function private.alerts_secret() from public, anon, authenticated;

-- ── 3. what was sent ──────────────────────────────────────────────────
-- One row per (ride, kind), which is what makes "send it once" a
-- constraint rather than a hope.

create table if not exists public.ride_alerts (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.rides (id) on delete cascade,
  kind        text not null,
  -- which occurrence of the kind this is. '' for the once-per-ride kinds;
  -- for driver_assigned, the assignment's own assigned_at, so a second
  -- assignment is a second row rather than a duplicate of the first.
  ref         text not null default '',
  status      text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  attempts    integer not null default 0,
  claimed_at  timestamptz,
  sent_at     timestamptz,
  provider_id text,
  last_error  text,
  created_at  timestamptz not null default now()
);

-- Named, and replaced rather than declared inline, so that re-running
-- this file after a new kind is added widens the check on a table that
-- already exists. `create table if not exists` alone would leave the old
-- list in place and every new kind would fail to claim.
alter table public.ride_alerts drop constraint if exists ride_alerts_kind_check;
alter table public.ride_alerts add constraint ride_alerts_kind_check
  check (kind in ('new', 'remind_12h', 'remind_2h', 'guest_confirmation', 'driver_assigned'));

-- One row per (ride, kind, occurrence). The first version of this file
-- made it (ride, kind) with no occurrence, which a table built by it still
-- carries under Postgres's generated name; it is dropped here so a
-- reassignment can be claimed at all.
alter table public.ride_alerts add column if not exists ref text not null default '';
alter table public.ride_alerts drop constraint if exists ride_alerts_ride_id_kind_key;
alter table public.ride_alerts drop constraint if exists ride_alerts_once;
alter table public.ride_alerts add constraint ride_alerts_once unique (ride_id, kind, ref);

-- RLS on and no policies: nobody reads or writes this through the API.
-- The two functions below are definers and are the only way in.
alter table public.ride_alerts enable row level security;
revoke all on public.ride_alerts from anon, authenticated;

-- ── 4. when is the pickup ─────────────────────────────────────────────
-- The booking flow writes scheduled_date + scheduled_time and not always
-- scheduled_at, the same fault pickupInstant() in src/lib/pickupPin.ts
-- exists for. A time that will not parse is a ride with no pickup time,
-- not an error that takes every other ride's alert down with it.

create or replace function private.pickup_at(p_at timestamptz, p_date text, p_time text)
returns timestamptz
language plpgsql
stable
as $$
begin
  if p_at is not null then return p_at; end if;
  if coalesce(p_date, '') = '' then return null; end if;
  return (p_date || ' ' || coalesce(nullif(p_time, ''), '00:00'))::timestamp
         at time zone 'America/Aruba';
exception when others then
  return null;
end;
$$;

-- ── 5. what is due, claimed ───────────────────────────────────────────
--
-- "Needs a driver" is needsDriver() in src/admin/lib/admin.ts exactly:
-- no driver, and pending or confirmed. The admin board and this email
-- must agree about which rides are uncovered, or one of them is lying.
--
-- new         any booking still open, made in the last two hours. The
--             window is how the first run does NOT email about every
--             booking ever made, and how a failed send is retried a
--             few times without being retried forever.
-- remind_12h  inside 12 hours of pickup and not yet inside 2. Only for
--             rides that already existed at the 12-hour mark; one made
--             later than that got its 'new' email a moment ago, and a
--             reminder straight after it would be noise.
-- remind_2h   inside 2 hours and before pickup, same rule.
-- guest_confirmation
--             the same window as 'new', and only for an address that at
--             least looks like one. Checkout requires a valid email, but
--             rows from before it did, or from the admin side, may not
--             carry one, and a send to "" is a failure Resend reports five
--             times over.
-- driver_assigned
--             a driver is on the ride, the assignment is under two hours
--             old (the same retry window, and how switching this on does
--             not email about every assignment ever made), the pickup is
--             still ahead, and the address looks like one. The occurrence
--             is the assignment's assigned_at in microseconds, written as
--             a number so it reads the same whatever timezone the session
--             is set to.
--
-- A claimed row that is never finished (the function crashed mid-send)
-- is reclaimable after ten minutes. A failed one is retried on later
-- runs, up to five attempts, while it is still due.

create or replace function public.claim_booking_alerts(p_secret text, p_limit integer default 5)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text := private.alerts_secret();
  v_alerts json;
begin
  if v_secret is null then
    return json_build_object('ok', false, 'error', 'not_configured');
  end if;
  if p_secret is null or p_secret <> v_secret then
    return json_build_object('ok', false, 'error', 'bad_secret');
  end if;

  with open_rides as (
    select r.id, r.status, r.driver_id, r.created_at, r.contact_email, r.assigned_at,
           private.pickup_at(r.scheduled_at, r.scheduled_date::text, r.scheduled_time::text) as pickup
      from public.rides r
     where r.status not in ('cancelled', 'canceled', 'completed')
  ),
  due as (
    select id as ride_id, 'new'::text as kind, ''::text as ref, pickup
      from open_rides
     where created_at > now() - interval '2 hours'
    union all
    select id, 'driver_assigned', (extract(epoch from assigned_at) * 1000000)::bigint::text, pickup
      from open_rides
     where driver_id is not null
       and assigned_at > now() - interval '2 hours'
       and (pickup is null or pickup > now())
       and btrim(coalesce(contact_email, '')) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    union all
    select id, 'guest_confirmation', '', pickup
      from open_rides
     where created_at > now() - interval '2 hours'
       and btrim(coalesce(contact_email, '')) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    union all
    select id, 'remind_12h', '', pickup
      from open_rides
     where driver_id is null and status in ('pending', 'confirmed')
       and now() >= pickup - interval '12 hours'
       and now() <  pickup - interval '2 hours'
       and created_at < pickup - interval '12 hours'
    union all
    select id, 'remind_2h', '', pickup
      from open_rides
     where driver_id is null and status in ('pending', 'confirmed')
       and now() >= pickup - interval '2 hours'
       and now() <  pickup
       and created_at < pickup - interval '2 hours'
  ),
  pending as (
    select d.* from due d
      left join public.ride_alerts a on a.ride_id = d.ride_id and a.kind = d.kind and a.ref = d.ref
     where a.id is null
        or (a.status = 'failed' and a.attempts < 5)
        or (a.status = 'sending' and a.claimed_at < now() - interval '10 minutes')
     order by d.pickup nulls last
     limit greatest(1, least(coalesce(p_limit, 5), 20))
  ),
  claimed as (
    insert into public.ride_alerts as a (ride_id, kind, ref, status, attempts, claimed_at)
    select ride_id, kind, ref, 'sending', 1, now() from pending
    on conflict (ride_id, kind, ref) do update
       set status = 'sending', attempts = a.attempts + 1, claimed_at = now()
     where (a.status = 'failed' and a.attempts < 5)
        or (a.status = 'sending' and a.claimed_at < now() - interval '10 minutes')
    returning a.id, a.ride_id, a.kind, a.ref, a.attempts
  )
  select coalesce(json_agg(json_build_object(
           'id', c.id,
           'kind', c.kind,
           'attempts', c.attempts,
           -- a driver email for a ride whose guest was already told
           -- about a different assignment: "your driver has changed"
           'changed', c.kind = 'driver_assigned' and exists (
             select 1 from public.ride_alerts x
              where x.ride_id = c.ride_id and x.kind = 'driver_assigned'
                and x.status = 'sent' and x.ref <> c.ref),
           'pickup_at', private.pickup_at(r.scheduled_at, r.scheduled_date::text, r.scheduled_time::text),
           -- the whole row, so a column this project adds later reaches
           -- the email without this function changing, and one it never
           -- ran the migration for is simply absent rather than an error
           'ride', to_jsonb(r)
         )), '[]'::json)
    into v_alerts
    from claimed c
    join public.rides r on r.id = c.ride_id;

  return json_build_object('ok', true, 'alerts', v_alerts);
end;
$$;

create or replace function public.finish_booking_alert(
  p_secret text, p_alert_id uuid, p_ok boolean, p_detail text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text := private.alerts_secret();
begin
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    return json_build_object('ok', false, 'error', 'bad_secret');
  end if;

  update public.ride_alerts
     set status      = case when p_ok then 'sent' else 'failed' end,
         sent_at     = case when p_ok then now() else sent_at end,
         provider_id = case when p_ok then p_detail else provider_id end,
         last_error  = case when p_ok then null else left(p_detail, 500) end
   where id = p_alert_id and status = 'sending';

  return json_build_object('ok', found);
end;
$$;

-- Callable with the public key: the secret check inside is the lock,
-- and without the secret both answer 'bad_secret' and touch nothing.
revoke all on function public.claim_booking_alerts(text, integer) from public;
revoke all on function public.finish_booking_alert(text, uuid, boolean, text) from public;
grant execute on function public.claim_booking_alerts(text, integer) to anon, authenticated;
grant execute on function public.finish_booking_alert(text, uuid, boolean, text) to anon, authenticated;

-- ── 6. the nudge ──────────────────────────────────────────────────────
-- pg_net queues the request and sends it after the booking's transaction
-- commits, so the function never looks for a ride that is not there yet,
-- and a booking that rolls back sends nothing.

create or replace function private.poke_booking_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text := private.alerts_secret();
begin
  if v_secret is null then return; end if;
  perform net.http_post(
    url                  := 'https://cabbystransfer.com/api/booking-alerts',
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'Authorization', 'Bearer ' || v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.poke_booking_alerts() from public, anon, authenticated;

create or replace function private.rides_alert_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- An alert must never cost a booking. If the nudge cannot be queued,
  -- the booking goes through and the next cron run sends the email.
  begin
    perform private.poke_booking_alerts();
  exception when others then
    raise warning 'booking alert nudge failed, the cron will catch it: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.rides_alert_on_insert() from public, anon, authenticated;

drop trigger if exists rides_alert_on_insert on public.rides;
create trigger rides_alert_on_insert
  after insert on public.rides
  for each row execute function private.rides_alert_on_insert();

-- ── 7. the guarantee ──────────────────────────────────────────────────
-- Every fifteen minutes. Most runs find nothing due and send nothing.
-- Scheduling under the same name again replaces the job, so re-running
-- this file does not stack a second one.

select cron.schedule('booking-alerts', '*/15 * * * *', $$select private.poke_booking_alerts()$$);

-- ── 8. tell PostgREST ─────────────────────────────────────────────────

notify pgrst, 'reload schema';

-- ── Checking on it ────────────────────────────────────────────────────
--
-- What has been sent, newest first:
--   select a.kind, a.status, a.attempts, a.sent_at, a.last_error, r.booking_ref
--     from public.ride_alerts a join public.rides r on r.id = a.ride_id
--    order by a.created_at desc limit 20;
--
-- Whether the endpoint answered (200 is good; 401 means the secret did
-- not match, 501 means RESEND_API_KEY is missing in Vercel):
--   select id, status_code, left(content::text, 200), created
--     from net._http_response order by created desc limit 10;
--
-- To stop the reminders:  select cron.unschedule('booking-alerts');
