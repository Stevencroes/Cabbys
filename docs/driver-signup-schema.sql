-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — drivers sign themselves up
-- Run in the Supabase SQL editor, AFTER docs/schema.sql,
-- docs/driver-schema.sql, docs/admin-schema.sql and
-- docs/onboarding-schema.sql. Every statement is idempotent, so the
-- script is safe to re-run.
--
-- ── Why this file exists ───────────────────────────────────────────
-- Until October 2026 a driver could not apply. Cabby's made the account,
-- then made the drivers row in the SQL editor, and only then could the
-- driver sign in. The owner asked for anyone opening /driver to be able
-- to sign up there, so the portal now has an application: create an
-- account, give a name, a phone number and the car, send the documents,
-- wait for an operator to approve.
--
-- The only thing the database has to add for that is a way for a
-- signed-in account to create ITS OWN drivers row. There is no insert
-- policy on public.drivers, and this file does not add one: RLS has no
-- column list, so a policy loose enough to let a driver insert their
-- row is loose enough to let them insert it with status = 'approved'.
-- A security definer function instead, the same shape as
-- save_driver_vehicle, that writes exactly the columns it names.
--
-- ── What it guarantees ─────────────────────────────────────────────
--   · The row is always the caller's own: user_id is auth.uid(), never
--     an argument.
--   · It is always 'pending'. Applying approves nobody; an operator
--     still presses Approve on the Drivers board (admin_set_driver_status
--     in docs/admin-schema.sql).
--   · An anonymous session cannot apply. A guest who books without an
--     account gets an anonymous Supabase user so their booking has an
--     auth.uid() — a receipt, not an identity, and not somebody to hand
--     a driver record to.
--   · Applying twice changes nothing. A second call on an account that
--     already has a row answers ok without touching it, so a driver who
--     double-taps, or one who is already approved, or suspended, cannot
--     reset their own status by applying again.
--
-- It does not update public.drivers at all, so the legacy
-- `drivers_protect` BEFORE UPDATE trigger (docs/admin-schema.sql §6)
-- has nothing to say about it.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. apply_as_driver ──────────────────────────────────────────────
-- Writes first_name / last_name, not full_name: the live table predates
-- this project and carries the pair (see saveDriverName in
-- src/driver/lib/driver.ts for the evening that cost).
drop function if exists public.apply_as_driver(text, text, text);
create function public.apply_as_driver(p_first text, p_last text, p_phone text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_first text := nullif(btrim(coalesce(p_first, '')), '');
  v_last  text := nullif(btrim(coalesce(p_last, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return json_build_object('ok', false, 'error', 'anonymous');
  end if;
  if v_first is null or v_phone is null then
    return json_build_object('ok', false, 'error', 'missing_details');
  end if;

  -- Already applied (or already a driver, approved or not): leave it.
  if exists (select 1 from public.drivers where user_id = v_uid) then
    return json_build_object('ok', true, 'existing', true);
  end if;

  insert into public.drivers (user_id, first_name, last_name, phone, status)
  values (v_uid, v_first, v_last, v_phone, 'pending')
  on conflict (user_id) do nothing;

  return json_build_object('ok', true, 'existing', false);
end;
$$;

revoke all on function public.apply_as_driver(text, text, text) from public, anon;
grant execute on function public.apply_as_driver(text, text, text) to authenticated;


-- ── 2. Check it landed ──────────────────────────────────────────────
-- Applications waiting on an operator, newest first:
--
-- select d.first_name, d.last_name, d.phone, u.email, d.status
--   from public.drivers d join auth.users u on u.id = d.user_id
--  where d.status = 'pending'
--  order by u.created_at desc;
