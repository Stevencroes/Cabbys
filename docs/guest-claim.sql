-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — claiming a guest booking onto a real account
--
-- Decision: booking stays guest-first. Nobody is asked for a password
-- before they are shown a price. When that traveler later creates an
-- account with the address they gave at checkout, the bookings they
-- already made attach to it.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- ⚠ READ THIS BEFORE RUNNING IT
-- Claim-by-email is exactly as trustworthy as email ownership. Email
-- confirmation is currently OFF in this project, which means signing up
-- with an address proves nothing about holding it: anyone who knows a
-- customer's email could sign up as them and claim their trips. The
-- function below is deliberately narrow — it only ever takes rides that
-- belong to nobody, and never takes one from another real account — but
-- that narrowness is not a substitute for confirmation.
-- Turn confirmations on (Authentication → Providers → Email → Confirm
-- email) once real SMTP is configured, and this becomes sound.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Find guest bookings by the address given at checkout ─────────
create index if not exists rides_contact_email_idx
  on public.rides (lower(contact_email));

-- ── 2. The claim ────────────────────────────────────────────────────
-- security definer because the caller cannot see rows that are not yet
-- theirs — that is the whole point of the RLS policy this works around.
-- The guard rails are inside the function, not in the caller's hands:
--
--   • the email is read from auth.users, never passed in
--   • only rides whose contact_email matches that address
--   • only rides that belong to NOBODY — unowned, or owned by a user
--     with no email of their own, which is what an anonymous guest
--     session is. A ride sitting on another real account is never moved.
--
-- Returns how many it took, so the page can say so.
drop function if exists public.claim_guest_rides();

create function public.claim_guest_rides()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_count integer;
begin
  if v_uid is null then
    return 0;
  end if;

  select nullif(trim(u.email), '') into v_email
  from auth.users u
  where u.id = v_uid;

  -- An anonymous session has no email of its own and claims nothing.
  if v_email is null then
    return 0;
  end if;

  update public.rides r
     set passenger_id = v_uid
   where lower(r.contact_email) = lower(v_email)
     and r.passenger_id is distinct from v_uid
     and (
       r.passenger_id is null
       or r.passenger_id in (
         select u.id from auth.users u
         where nullif(trim(u.email), '') is null
       )
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_guest_rides() from public, anon;
grant execute on function public.claim_guest_rides() to authenticated;

-- ── 3. Nothing else changes ─────────────────────────────────────────
-- The read policy is already `passenger_id = auth.uid()`, so a claimed
-- ride appears on My Trips the moment this returns. See docs/schema.sql §3.


-- ═══════════════════════════════════════════════════════════════════
-- The old test rides — LOOK BEFORE YOU DELETE
--
-- These are the rows that made My Trips look like it was full of seed
-- data. They are real bookings made from one browser while testing: the
-- anonymous Supabase user is kept in localStorage, so every guest
-- booking from that browser shared one id. The app no longer shows them
-- to anyone, so there is no hurry.
--
-- List them first:
--
--   select r.id, r.booking_ref, r.scheduled_date, r.scheduled_time,
--          r.pickup_location, r.dropoff_location, r.status,
--          r.contact_email, r.created_at
--     from public.rides r
--     left join auth.users u on u.id = r.passenger_id
--    where r.passenger_id is null
--       or nullif(trim(u.email), '') is null
--    order by r.created_at desc;
--
-- Read that list. Anything with a real contact_email is a booking a real
-- person made as a guest, and claim_guest_rides() will hand it back to
-- them the day they make an account — deleting it loses their history.
-- Only delete rows you recognise as your own testing, by id:
--
--   delete from public.rides where id in ('…', '…');
-- ═══════════════════════════════════════════════════════════════════
