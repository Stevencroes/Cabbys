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

-- ── 3. which flights are worth asking about ──────────────────────────
--
-- The cadence is the budget. A flight a day out is asked about once; one
-- landing within the hour is asked about every twenty-five minutes,
-- which is when the answer actually changes what a driver does.
--
--   further than 6h      once every 12 hours
--   2h to 6h             every 3 hours
--   under 2h             every 25 minutes
--
-- Roughly six or seven units per airport transfer, and flights nobody is
-- being collected from cost nothing at all, because this reads from the
-- rides table rather than from a timetable.

create or replace function public.flights_due(p_limit integer default 6)
returns table (flight text, day date)
language sql
stable
security definer
set search_path = public
as $$
  with booked as (
    select
      -- the same normalising the app does: strip spaces, drop the
      -- padded zero, so KL0765 / "KL 765" / KL765 are one flight
      regexp_replace(upper(regexp_replace(r.flight_number, '\s+', '', 'g')),
                     '^([A-Z]{1,3})0*([0-9]+)', '\1\2') as flight,
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
      or (s.at - now() < interval '2 hours' and f.checked_at < now() - interval '25 minutes')
      or (s.at - now() < interval '6 hours' and f.checked_at < now() - interval '3 hours')
      or (f.checked_at < now() - interval '12 hours')
   order by s.at
   limit p_limit;
$$;

-- ── 4. tell PostgREST ────────────────────────────────────────────────

notify pgrst, 'reload schema';

-- ── 5. the schedule ──────────────────────────────────────────────────
--
-- Run this ONCE, after the edge function is deployed and after its
-- secrets are set. Replace <PROJECT-REF> and <SERVICE-ROLE-KEY>.
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
--       headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE-ROLE-KEY>"}'::jsonb,
--       body    := '{}'::jsonb
--     );
--     $cron$
--   );
--
-- To stop it:        select cron.unschedule('flight-refresh');
-- To see it run:     select * from cron.job_run_details order by start_time desc limit 20;
-- To see the meter:  select * from public.flight_budget;
