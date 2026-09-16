-- ═══════════════════════════════════════════════════════════════════════
--  Cabby's — the guest's own pickup pin
--  Run this whole file in the Supabase SQL editor. It is idempotent.
-- ═══════════════════════════════════════════════════════════════════════
--
-- rides.pickup_lat, pickup_lng and pickup_note are columns
-- docs/driver-schema.sql has created since the beginning and NOTHING HAS
-- EVER WRITTEN. The driver screen reads all three and the admin board
-- reads two, so the receiving end has been finished and honest for a
-- while — the driver's map badge says "Guest pinned" only for a real
-- dropped coordinate and "Approximate — from the address" otherwise.
-- This file is the missing writer.
--
-- Why an RPC and not an update policy: the same reason every other write
-- in this project goes through one. RLS shows USING the old row and WITH
-- CHECK the new one with no way to compare them, and it has no column
-- list — so a policy permissive enough to let a guest set their own pin
-- is permissive enough to let them set their own fare.
--
-- ── What this deliberately refuses ────────────────────────────────────
--
-- A coordinate outside Aruba. This is the whole safety of the feature,
-- not a nicety. The failure mode of "drop a pin where you'll be" is a
-- guest tapping it from seat 24B, or from home three weeks early, and
-- handing their driver a point in Newark with more authority than the
-- resort name it overrides — the driver's screen calls a dropped pin
-- "Guest pinned" and zooms to door level on it. A pin that cannot be
-- right is worse than no pin, so one that is not on this island is
-- refused here, where no client can talk its way past it.
--
-- The box is the island plus a margin of coastal water, and it stops
-- well short of its neighbours: Curaçao begins near -69.2 and the
-- Venezuelan mainland below 12.2, both comfortably outside.

-- ── 1. set_pickup_pin ────────────────────────────────────────────────

drop function if exists public.set_pickup_pin(uuid, double precision, double precision, text);
create function public.set_pickup_pin(
  p_ride_id uuid,
  p_lat     double precision default null,
  p_lng     double precision default null,
  p_note    text             default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_mine   boolean;
  v_note   text;
begin
  select true, status into v_mine, v_status
    from public.rides
   where id = p_ride_id and passenger_id = auth.uid();

  if v_mine is not true then
    return json_build_object('ok', false, 'error', 'not_yours');
  end if;

  if v_status in ('cancelled', 'canceled') then
    return json_build_object('ok', false, 'error', 'already_cancelled');
  end if;

  -- Past the trip there is nobody left to tell. A completed ride is a
  -- financial record and this would be editing one.
  if v_status = 'completed' then
    return json_build_object('ok', false, 'error', 'already_driven');
  end if;

  -- A note and a coordinate are two different offers and either may
  -- arrive alone: the note is knowledge ("main lobby, by the fountain")
  -- and can be given weeks ahead, the coordinate is a position and only
  -- means anything while the guest is standing on it.
  if p_lat is null and p_lng is null and p_note is null then
    return json_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  if (p_lat is null) <> (p_lng is null) then
    return json_build_object('ok', false, 'error', 'half_a_pin');
  end if;

  if p_lat is not null then
    if p_lat <  12.35 or p_lat >  12.68
    or p_lng < -70.15 or p_lng > -69.80 then
      return json_build_object('ok', false, 'error', 'not_in_aruba');
    end if;
  end if;

  -- The driver reads this on a phone at the kerb. Anything past a couple
  -- of lines is not a landmark any more, it is a paragraph nobody reads.
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if length(coalesce(v_note, '')) > 140 then
    return json_build_object('ok', false, 'error', 'note_too_long');
  end if;

  update public.rides
     set pickup_lat  = coalesce(p_lat, pickup_lat),
         pickup_lng  = coalesce(p_lng, pickup_lng),
         -- an empty note is an erasure the guest asked for, so this one
         -- is set rather than coalesced when the caller sent the field
         pickup_note = case when p_note is null then pickup_note else v_note end
   where id = p_ride_id and passenger_id = auth.uid();

  return json_build_object(
    'ok', true,
    'pinned', p_lat is not null,
    'note', v_note
  );
end;
$$;

grant execute on function public.set_pickup_pin(uuid, double precision, double precision, text) to authenticated;
grant execute on function public.set_pickup_pin(uuid, double precision, double precision, text) to anon;

-- anon as well as authenticated: a guest who booked without an account
-- holds an anonymous session, and auth.uid() inside the function is that
-- anonymous user's id. It is still their own row and no one else's — the
-- passenger_id check above is what enforces that, not the grant.

-- ── 2. tell PostgREST the function exists ────────────────────────────
-- Without this the portal gets "Could not find the function
-- public.set_pickup_pin(...) in the schema cache" against a function that
-- is plainly there.

notify pgrst, 'reload schema';
