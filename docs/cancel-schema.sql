-- ═══════════════════════════════════════════════════════════════════════
--  Cabby's — the guest cancelling their own booking
--  Run this whole file in the Supabase SQL editor. It is idempotent.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Replaces the "rides: cancel own" UPDATE policy from docs/schema.sql
-- with a function, and drops that policy. The last write in this project
-- that went through an RLS policy instead of a security-definer function
-- now goes through one like every other.
--
-- ── What was wrong with the policy ────────────────────────────────────
--
-- It read:
--
--     for update to authenticated
--     using      (passenger_id = auth.uid() and status in (...four...))
--     with check (status = 'cancelled')
--
-- WITH CHECK constrains the new row's STATUS and nothing else. RLS has no
-- column list and no way to compare old and new, so the same request that
-- cancels a booking may rewrite any other column on it in passing:
--
--   · notes — including the "Cancelled by Cabby's: <reason>" line that
--     admin_cancel_ride appends and My Trips shows the guest as the
--     reason Cabby's gave. A guest could write that line themselves.
--   · fare_total, price, payment_status, driver_id, contact_* — all of
--     them, on their own booking, in the same UPDATE.
--
-- docs/pin-schema.sql names this exact failure for the pin: "a policy
-- permissive enough to let a guest set their own pin is permissive
-- enough to let them set their own fare." It was true here too.
--
-- The second fault was quieter. Outside the four statuses the policy's
-- USING clause matched zero rows, and Postgres reports a zero-row UPDATE
-- as success — so the client could only guess at a refusal from an empty
-- result, and could never say WHY. This function says why.
--
-- ── What the function allows ──────────────────────────────────────────
--
-- Exactly one change, to exactly one column: status → 'cancelled', on the
-- caller's own booking, from the same four statuses the policy allowed,
-- and only before the pickup time. Nothing else on the row can be touched
-- through it, because it does not take anything else.
--
-- The pickup-time rule is new here and matches what My Trips already
-- enforces (canCancel in src/lib/tripStatus.ts): after the pickup time a
-- cancellation is a conversation with Cabby's, not a button. Stating it
-- in the database makes the screen's rule the real one rather than a
-- suggestion a crafted request could step around.

-- ── 1. the function ──────────────────────────────────────────────────

create or replace function public.cancel_my_ride(p_ride_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_mine   boolean;
  v_at     timestamptz;
begin
  -- FOR UPDATE: a driver claiming this ride in the same instant waits for
  -- the guest's decision rather than racing it, so a booking can never end
  -- up both cancelled and freshly assigned.
  select true,
         status,
         coalesce(
           scheduled_at,
           (scheduled_date || ' ' || coalesce(scheduled_time, '00:00'))::timestamp
             at time zone 'America/Aruba'
         )
    into v_mine, v_status, v_at
    from public.rides
   where id = p_ride_id and passenger_id = auth.uid()
     for update;

  if v_mine is not true then
    return json_build_object('ok', false, 'error', 'not_yours');
  end if;

  -- Asking twice is not an error. A retry after a dropped connection —
  -- the first attempt landed, the answer did not — must not tell the
  -- guest their cancellation failed.
  if v_status in ('cancelled', 'canceled') then
    return json_build_object('ok', true, 'already', true);
  end if;

  if v_status = 'completed' then
    return json_build_object('ok', false, 'error', 'already_driven');
  end if;

  -- The same four the policy allowed. A driver on the way, at the kerb or
  -- with the guest aboard is past the point a button should decide.
  if v_status not in ('pending', 'pending_payment', 'confirmed', 'driver_assigned') then
    return json_build_object('ok', false, 'error', 'already_underway');
  end if;

  if v_at is not null and v_at <= now() then
    return json_build_object('ok', false, 'error', 'pickup_passed');
  end if;

  update public.rides
     set status = 'cancelled'
   where id = p_ride_id and passenger_id = auth.uid();

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_my_ride(uuid) from public;
grant execute on function public.cancel_my_ride(uuid) to authenticated;
grant execute on function public.cancel_my_ride(uuid) to anon;

-- anon as well as authenticated, for the same reason as set_pickup_pin: a
-- guest who booked without an account holds an anonymous session, and it
-- is still their own row. The passenger_id check is what enforces that,
-- not the grant — a caller with no session has auth.uid() null, matches
-- no row, and gets 'not_yours'.

-- ── 2. retire the policy ─────────────────────────────────────────────
-- Dropped only now that the function exists, so there is no moment in
-- this file where a guest cannot cancel at all. The app calls the
-- function first and only falls back to the old direct UPDATE if the
-- function is missing, so the order in which the app and this file are
-- deployed does not matter either.

drop policy if exists "rides: cancel own" on public.rides;

-- ── 3. tell PostgREST the function exists ────────────────────────────
-- Without this the app gets "Could not find the function
-- public.cancel_my_ride(...) in the schema cache" against a function that
-- is plainly there.

notify pgrst, 'reload schema';
