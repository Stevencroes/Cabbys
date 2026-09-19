-- ═══════════════════════════════════════════════════════════════════════
--  Cabby's — flight tracking storage
--  Run this whole file in the Supabase SQL editor. It is idempotent.
-- ═══════════════════════════════════════════════════════════════════════
--
-- The plan is 400 units a month. That number is the design, not a
-- footnote, and three things here exist because of it.
--
-- ONE ASKER. The browser never calls AeroDataBox. A scheduled function
-- holds the key, asks, and writes what it learns here; every driver,
-- guest and admin screen reads this table for nothing. If the browser
-- asked, five drivers with the app open would be five times the bill for
-- the same answer, and the key would be sitting in a bundle anyone can
-- read — it is neither domain-locked like the Maps key nor publishable
-- by design like Stripe's.
--
-- ONE ROW PER FLIGHT PER DAY. Six guests off the same aircraft are one
-- row and one unit, not six.
--
-- THE RAW ANSWER IS WHAT IS STORED. Not a parsed summary. The parsing
-- lives in src/lib/providers/aerodatabox.ts where it is tested against a
-- real response, and three faults have already been found in that
-- response that no one would have guessed. Keeping the vendor's own JSON
-- means a fix to the parser corrects rows already on disk instead of
-- needing them re-fetched — which would cost units we do not have.

-- ── 1. what we have been told ────────────────────────────────────────

create table if not exists public.flight_status (
  flight     text        not null,
  day        date        not null,
  /** the vendor's answer, verbatim. null when they had none. */
  raw        jsonb,
  /** false when the ask itself failed, so a screen can tell "no such
      flight" from "we could not ask" — the first is an answer. */
  ok         boolean     not null default true,
  checked_at timestamptz not null default now(),
  primary key (flight, day)
);

alter table public.flight_status enable row level security;

-- Public flight data: a landing time is on a board in the terminal. The
-- only thing worth protecting here is the ability to WRITE it, and that
-- is protected by there being no write policy at all — the scheduled
-- function uses the service role, which bypasses RLS.
drop policy if exists "flight status: anyone may read" on public.flight_status;
create policy "flight status: anyone may read"
  on public.flight_status for select
  to anon, authenticated
  using (true);

-- ── 2. the meter ─────────────────────────────────────────────────────
-- A hard monthly ceiling, in the database rather than in the function,
-- so it survives a redeploy and cannot be argued with by a bug in the
-- caller. Reaching it means flight tracking goes quiet — which is the
-- same as having no key, which every screen already handles.

create table if not exists public.flight_budget (
  month text    primary key,      -- 'YYYY-MM', Aruba time
  used  integer not null default 0,
  cap   integer not null default 380
);

alter table public.flight_budget enable row level security;
-- no policies: the scheduled function is the only thing that touches it

-- 380 against a plan of 400. The margin is for the hand-run checks you
-- will make while setting this up, and for the month AeroDataBox counts
-- something we did not expect.

create or replace function public.flight_budget_take()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(now() at time zone 'America/Aruba', 'YYYY-MM');
  v_ok    boolean;
begin
  insert into public.flight_budget (month) values (v_month)
    on conflict (month) do nothing;

  -- Claims the unit and reports whether it was there to claim, in one
  -- statement. Asking first and spending second is how two runs of the
  -- same cron both spend the last unit.
  update public.flight_budget
     set used = used + 1
   where month = v_month and used < cap
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

-- Shut to everyone but the scheduler. THIS IS NOT HOUSEKEEPING.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and
-- the anon key is public by design — it ships inside the JavaScript
-- every visitor downloads. Left as it was, anyone who opened dev tools
-- on the site could POST to /rest/v1/rpc/flight_budget_take in a loop
-- and spend all 380 units in a few seconds, every month, for nothing.
--
-- Every other function in this project survives that default because it
-- checks auth.uid() or is_admin() itself and refuses a stranger. These
-- two do neither, on purpose: the scheduler is the only caller and has
-- no user to check. That makes the grant the only thing holding the
-- door, so the door has to be shut explicitly.
--
-- service_role is named because revoking from public revokes it too —
-- it is not a superuser and does not own these functions.
revoke all on function public.flight_budget_take() from public, anon, authenticated;
grant execute on function public.flight_budget_take() to service_role;

-- ── 3. which flights are worth asking about ──────────────────────────
--
-- The cadence IS the budget, so it is sized against the real number of
-- airport pickups rather than against what feels attentive.
--
--   further than 6h      once every 12 hours
--   2h to 6h             every 4 hours
--   under 2h             every hour
--
-- Six units per flight-day, replayed against the cron's ten-minute tick
-- rather than estimated. At sixty airport transfers a month that is
-- about 330 against a cap of 380 — and fewer in practice, because six
-- guests off one aircraft are one row here, not six. Flights nobody is
-- being collected from cost nothing at all: this reads from the rides
-- table, not from a timetable.
--
-- The ceiling that follows from those numbers, worth knowing before it
-- arrives: past roughly 63 flight-days a month the free plan cannot
-- cover this cadence, and the honest fix is the paid tier rather than a
-- looser cadence. Loosening further would start costing the driver the
-- thing this is for.
--
-- What the last tier used to be, and why it changed: every 25 minutes
-- under 2 hours, which came to ten units per flight-day and would have
-- emptied the month's budget around the 20th — flight tracking then
-- going quiet for the rest of the month with nothing on any screen
-- saying so. An hour is chosen to put a fresh answer in front of the
-- driver at the moment they decide to leave, which is around an hour
-- before pickup. Between that decision and the kerb, a newer number
-- changes nothing they can act on.

create or replace function public.flights_due(p_limit integer default 6)
returns table (flight text, day date)
language sql
stable
security definer
set search_path = public
as $$
  with booked as (
    select
      -- The same normalising the app does — strip spaces, drop the
      -- padded zero — so KL0765 / "KL 765" / KL765 are one flight.
      --
      -- Two passes, not one pattern with an alternation, and the same
      -- two in src/lib/flight.ts. An IATA airline code is two characters
      -- and either may be a digit (B6 is JetBlue, 3M is Silver), so the
      -- letters-only pass cannot see those at all and the second pass
      -- exists for them. Their first characters are disjoint, so neither
      -- regex engine has a choice to make and both produce the same
      -- string. That matters more than it looks: this expression decides
      -- the key a row is WRITTEN under and flight.ts decides the key it
      -- is READ back by. They disagree, and every lookup misses a row
      -- that is sitting right there. Change one, change the other.
      regexp_replace(
        regexp_replace(
          upper(regexp_replace(r.flight_number, '\s+', '', 'g')),
          '^([A-Z]{2,3})0*([0-9]{1,4}[A-Z]?)$', '\1\2'),
        '^([A-Z][0-9]|[0-9][A-Z])0*([0-9]{1,4}[A-Z]?)$', '\1\2') as flight,
      coalesce(
        r.scheduled_at,
        (r.scheduled_date || ' ' || coalesce(r.scheduled_time, '00:00'))::timestamp
          at time zone 'America/Aruba'
      ) as at
    from public.rides r
    where r.flight_number is not null
      and btrim(r.flight_number) <> ''
      and r.status not in ('cancelled', 'canceled', 'completed')
      and r.pickup_location ilike '%airport%'
  ),
  soon as (
    select b.flight,
           (b.at at time zone 'America/Aruba')::date as day,
           min(b.at) as at
      from booked b
     where b.at between now() - interval '1 hour' and now() + interval '26 hours'
     group by b.flight, (b.at at time zone 'America/Aruba')::date
  )
  select s.flight, s.day
    from soon s
    left join public.flight_status f
      on f.flight = s.flight and f.day = s.day
   where f.checked_at is null
      or (s.at - now() < interval '2 hours' and f.checked_at < now() - interval '60 minutes')
      or (s.at - now() < interval '6 hours' and f.checked_at < now() - interval '4 hours')
      or (f.checked_at < now() - interval '12 hours')
   order by s.at
   limit p_limit;
$$;

-- Same reasoning, different damage: this one reads the flight numbers of
-- every upcoming airport ride out of the rides table, as a definer, so
-- on the default grant it hands an anonymous caller a column that RLS is
-- otherwise protecting.
revoke all on function public.flights_due(integer) from public, anon, authenticated;
grant execute on function public.flights_due(integer) to service_role;

-- ── 4. tell PostgREST ────────────────────────────────────────────────

notify pgrst, 'reload schema';

-- ── 5. the schedule ──────────────────────────────────────────────────
--
-- Run this ONCE, after the edge function is deployed and after its
-- secrets are set. Replace <PROJECT-REF> and <SERVICE-ROLE-KEY>.
--
-- <SERVICE-ROLE-KEY> MUST BE THE LEGACY JWT — the long eyJ… one from
-- Project Settings → API, the same string the Test panel accepts. The
-- function's "Verify JWT with legacy secret" setting is on, and it
-- requires a JWT signed by the legacy secret; a newer sb_secret_… key is
-- not a JWT and is turned away by the platform before the function runs.
--
-- Get this wrong and nothing announces it. cron.job_run_details will
-- record the POST as succeeding, because pg_net's job is to send the
-- request and it sent one — the 401 comes back later, to nobody. The
-- symptom is silence: no rows, no spend, no error, for weeks. Check the
-- function's Invocations tab after the first firing rather than trusting
-- the cron's own log.
--
-- Every ten minutes is the heartbeat, NOT the call rate: most runs find
-- nothing due and spend nothing. flights_due() decides, and p_limit caps
-- any single run at six.
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule(
--     'flight-refresh',
--     '*/10 * * * *',
--     $cron$
--     select net.http_post(
--       url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/flight-refresh',
--       headers := '{"Content-Type":"application/json","apikey":"<SB-SECRET-KEY>"}'::jsonb,
--       body    := '{}'::jsonb
--     );
--     $cron$
--   );
--
-- To stop it:        select cron.unschedule('flight-refresh');
-- To see it run:     select * from cron.job_run_details order by start_time desc limit 20;
-- To see the meter:  select * from public.flight_budget;
