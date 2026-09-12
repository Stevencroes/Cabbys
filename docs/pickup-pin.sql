-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — the guest's pickup pin
-- Run in the Supabase SQL editor, after docs/schema.sql and
-- docs/driver-schema.sql. Every statement is idempotent.
--
-- WHY THIS EXISTS. driver-schema.sql created rides.pickup_lat,
-- pickup_lng and pickup_note, and the driver's ride screen has read them
-- since it was written. Nothing ever wrote them: the guest-drops-a-pin
-- flow was specified and never built, so every ride reached the driver
-- with no coordinates and the map had nothing to centre on. This is the
-- missing half.
--
-- WHY A FUNCTION AND NOT A POLICY. The obvious move is another update
-- policy on `rides`, and it is the wrong one. Postgres RLS shows USING
-- the old row and WITH CHECK the new one, with no way to compare them —
-- so a policy permissive enough to let a guest set three columns is
-- permissive enough to let them set fare_total, status or driver_id in
-- the same statement. There is no column list in RLS. A security-definer
-- function has one, because it does the writing itself.
--
-- It also keeps the guest-side write path looking like the driver-side
-- one: claim_ride() and set_ride_status() are the same shape for the
-- same reason, and all three return a json {ok} rather than throwing.
-- ═══════════════════════════════════════════════════════════════════

drop function if exists public.set_pickup_pin(uuid, double precision, double precision, text);
create function public.set_pickup_pin(
  p_ride_id uuid,
  p_lat     double precision,
  p_lng     double precision,
  p_note    text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  -- Aruba's bounding box, generously drawn. A pin outside it is a phone
  -- that answered with the hotel's wifi geolocation in another country,
  -- or a stale fix from the airport they flew out of — either way it is
  -- worse than no pin, because the driver's map would believe it.
  if p_lat is not null and (
       p_lat not between 12.3 and 12.75 or p_lng not between -70.2 and -69.75
     ) then
    return json_build_object('ok', false, 'error', 'off_island');
  end if;

  update public.rides
     set pickup_lat  = coalesce(p_lat, pickup_lat),
         pickup_lng  = coalesce(p_lng, pickup_lng),
         pickup_note = coalesce(nullif(btrim(p_note), ''), pickup_note)
   where id = p_ride_id
     and passenger_id = auth.uid()
     -- only a ride still ahead of them: a pin on a finished trip is
     -- either a mistake or somebody editing history
     and status in ('pending', 'pending_payment', 'confirmed', 'driver_assigned', 'en_route');

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'not_yours');
  end if;

  return json_build_object('ok', true, 'ride_id', p_ride_id);
end;
$$;

grant execute on function public.set_pickup_pin(uuid, double precision, double precision, text) to authenticated;

-- ── Note on who can see it ──────────────────────────────────────────
-- Nothing below is needed, and that is the point: the driver side
-- already reads these columns through "rides: read assigned", and
-- open_rides deliberately omits all three — so a dropped pin unlocks
-- when the job is claimed and not a moment earlier. See section 3 of
-- docs/driver-schema.sql.
