-- ═══════════════════════════════════════════════════════════════════
-- Cabby's — driver onboarding documents
-- Run in the Supabase SQL editor, AFTER docs/schema.sql,
-- docs/driver-schema.sql and docs/admin-schema.sql. Every statement is
-- idempotent, so the script is safe to re-run.
--
-- ── Why this file exists ───────────────────────────────────────────
-- docs/admin-schema.sql gave an operator a button for approving a
-- driver. It did not give them anything to LOOK AT before pressing it.
-- The gate a waiting driver sees says "We're checking your licence and
-- vehicle details" — which was, until this file, a sentence about a
-- process that did not exist anywhere in the software. The licence was
-- checked, when it was checked at all, by somebody being sent a photo
-- on WhatsApp.
--
-- Five documents, listed in src/driver/lib/documents.ts. The list lives
-- in TypeScript and NOT in this file on purpose — see section 3.
--
-- ── The one decision that is not negotiable ────────────────────────
-- THE BUCKET IS PRIVATE. driver-photos (docs/driver-schema.sql §5d) is
-- public, and the comment there explains why: a guest who is not signed
-- in as anybody has to see the face of the driver walking towards them.
-- None of that reasoning survives the trip to a passport scan. A public
-- bucket is a URL, and a URL is forwardable — these are the documents
-- that would let somebody impersonate a driver. So: a separate bucket,
-- private, with a driver able to reach only their own folder, an admin
-- able to read all of them, and the operator's view of a document served
-- as a signed URL that expires in a minute.
--
-- ── What this file deliberately does NOT do ────────────────────────
-- It does not add a status. drivers.status is pending / approved /
-- suspended with a check constraint behind it, and a second vocabulary
-- for "documents cleared" would immediately raise the question of which
-- of the two decides whether claim_ride() answers. Nothing here writes
-- drivers at all. Accepting five documents does not approve anybody;
-- it puts the evidence in front of the operator who does, and that
-- operator still presses Approve on the Drivers board.
--
-- It therefore does not touch a single column the legacy
-- `drivers_protect` BEFORE UPDATE trigger guards (status, user_id,
-- approved_at, rating — see docs/admin-schema.sql §6). There is no
-- update to public.drivers anywhere below, so there is nothing for that
-- trigger to silently revert. This was checked rather than assumed,
-- because assuming it cost this project an entire evening once already.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Where the documents live ─────────────────────────────────────
-- Private. `public => false` is the whole security model of this file:
-- with it false, getPublicUrl() returns a URL that 400s, and the only
-- way to read an object is a signed URL minted by somebody the policies
-- in section 2 admit.
--
-- The two limits are set on the BUCKET as well as in the browser
-- (DOC_MAX_BYTES and the accept filter in src/driver/lib/documents.ts),
-- because a limit that only exists in the client is a limit that exists
-- until somebody opens devtools. Storage refuses a 20MB file and
-- refuses a .exe renamed to .pdf on the way in, whatever the page says.
--
-- 8MB: a phone photographing four pages of an insurance certificate and
-- exporting it as a PDF lands around 3-5MB, and the driver is doing
-- this on island mobile data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'driver-docs', 'driver-docs', false, 8388608, array['application/pdf']
where not exists (select 1 from storage.buckets where id = 'driver-docs');

-- and if the bucket already exists — from an earlier run of this file, or
-- made by hand in the dashboard — bring it to the same settings rather
-- than leaving a public bucket standing because `if not exists` was
-- satisfied. A bucket that exists and is public is the exact failure
-- this file is written to prevent, so it is corrected, not skipped.
update storage.buckets
   set public             = false,
       file_size_limit    = 8388608,
       allowed_mime_types = array['application/pdf']
 where id = 'driver-docs';


-- ── 2. Who may touch an object in it ────────────────────────────────
-- The same foldername() pattern as driver-photos, for the same reason:
-- storage.foldername() splits the object name on "/", so an object
-- called "<uid>/drivers-licence.pdf" is reachable only by that uid.
-- The difference is the SELECT — driver-photos grants it to the world
-- and this grants it to the owner and to an operator, nobody else.
drop policy if exists "driver docs: read own" on storage.objects;
create policy "driver docs: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "driver docs: write own" on storage.objects;
create policy "driver docs: write own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Replacing is the ordinary case, not the exception: a rejected document
-- is re-uploaded over the top of itself, and a licence expires every few
-- years. Without this the second upload of anything fails.
drop policy if exists "driver docs: replace own" on storage.objects;
create policy "driver docs: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- The operator's read. Additive, like every admin policy in
-- docs/admin-schema.sql — a driver's own access is byte-for-byte what
-- the three policies above give them, and this sits alongside.
--
-- It is what makes createSignedUrl() work from the board: signing an
-- object requires being able to select it. The signature is minted for
-- sixty seconds (src/admin/lib/admin.ts), so what leaves this database
-- is a link that has stopped working by the time anybody could forward
-- it anywhere.
drop policy if exists "driver docs: read as admin" on storage.objects;
create policy "driver docs: read as admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-docs' and public.is_admin());


-- ── 3. The documents themselves ─────────────────────────────────────
-- One row per document a driver has actually uploaded. A document that
-- has NOT been uploaded has no row — "missing" is the absence of a row,
-- not a fourth status. That is deliberate: the list of documents Aruba
-- requires is data the owner edits (src/driver/lib/documents.ts), and a
-- table that carried a 'missing' row per required document would have to
-- be migrated every time that list changed. Instead the app knows the
-- list, the database knows what arrived, and "still outstanding" is the
-- difference between the two.
--
-- The slug is NOT constrained to the five. Same reason: the five live in
-- TypeScript where the owner can edit them without a migration, and a
-- check constraint here would mean every change to Aruba's paperwork is
-- a database deployment. What IS constrained is the shape (section 4),
-- so a slug cannot be anything but a short identifier. A driver who
-- forged an extra slug through the RPC would file a row nothing renders.
--
-- `status` is per-DOCUMENT and has nothing to do with drivers.status. It
-- is three words rather than four because 'missing' is the absent row:
--   uploaded   the driver has sent it; nobody has looked yet
--   accepted   an operator has looked and it is good
--   rejected   an operator has looked and it is not — `reason` says why,
--              and the driver re-uploads over the top of it
--
-- `reason` is not optional on a rejection and section 5 refuses one
-- without it. A document sent back with no reason is a driver who cannot
-- act: they are told to fix something and not told what, and the only
-- move left is a WhatsApp message to the person who just rejected it.
create table if not exists public.driver_documents (
  id             uuid primary key default gen_random_uuid(),
  -- the AUTH id, never drivers.id. Every policy, every RPC and
  -- rides.driver_id in this project key on auth.uid(); a table keyed on
  -- the drivers row's own primary key would be the one thing here that
  -- did not, and the note at the top of docs/driver-schema.sql records
  -- what that already cost once.
  driver_user_id uuid not null references auth.users (id) on delete cascade,
  slug           text not null,
  -- the storage object's name, "<uid>/<slug>.pdf". Held rather than
  -- recomposed at read time so that a change to the naming scheme does
  -- not orphan every document already uploaded under the old one.
  path           text not null,
  status         text not null default 'uploaded'
                   check (status in ('uploaded', 'accepted', 'rejected')),
  reason         text,
  uploaded_at    timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users (id),
  -- One current document per slug per driver. The re-upload path is an
  -- upsert onto this constraint, so a driver correcting a rejected
  -- licence replaces it rather than leaving the operator two licences
  -- and no way to tell which one is being talked about.
  unique (driver_user_id, slug)
);

create index if not exists driver_documents_driver_idx
  on public.driver_documents (driver_user_id);

alter table public.driver_documents enable row level security;

grant select on public.driver_documents to authenticated;

-- Reads are policies; writes are functions. Same rule as everywhere else
-- in this project, and the reason is restated in docs/admin-schema.sql
-- §4: an RLS update policy sees the old row in USING and the new one in
-- WITH CHECK with no way to compare them, and it has no column list. A
-- policy loose enough to let a driver record an upload would be loose
-- enough to let them set their own document to 'accepted'.
drop policy if exists "driver documents: read own" on public.driver_documents;
create policy "driver documents: read own" on public.driver_documents
  for select to authenticated using (driver_user_id = auth.uid());

drop policy if exists "driver documents: read as admin" on public.driver_documents;
create policy "driver documents: read as admin" on public.driver_documents
  for select to authenticated using (public.is_admin());

-- NO insert, update or delete policy exists on this table, on purpose.
-- Sections 4 and 5 are the only two ways a row here is ever written.


-- ── 4. save_driver_document — the driver's only write path ──────────
-- Called after the file itself has landed in storage, to record that it
-- did. The upload is governed by the policies in section 2; this governs
-- what the operator's board is then told about it.
--
-- The path check is the one that matters, and it is not the same check
-- as the storage policy. Storage stops a driver WRITING an object under
-- somebody else's uid. Nothing there stops them filing a ROW that points
-- at somebody else's object — and the operator's view is minted from
-- this row's path, so without the check below, driver A could have the
-- board show them driver B's passport, or have B's accepted licence
-- reviewed as their own.
--
-- A re-upload resets the review. A document that has just been replaced
-- has not been looked at, whatever was decided about the copy before it:
-- leaving 'accepted' in place would show the operator a green tick over
-- a file nobody has opened, and leaving 'rejected' in place would show
-- the driver a refusal of a document they have already fixed.
drop function if exists public.save_driver_document(text, text);
create function public.save_driver_document(p_slug text, p_path text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_slug text := btrim(coalesce(p_slug, ''));
  v_path text := btrim(coalesce(p_path, ''));
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- An account with no drivers row has no application for a document to
  -- belong to. Said as its own answer rather than allowed to succeed
  -- into a table nothing will ever read: DriverGuard already has a
  -- screen for "signed in, but no driver profile", and this is the same
  -- situation reached through a different door.
  if not exists (select 1 from public.drivers where user_id = v_uid) then
    return json_build_object('ok', false, 'error', 'no_driver');
  end if;

  -- Shape only, not membership — the list of documents is TypeScript
  -- (see section 3). This stops a slug being a sentence, a path
  -- fragment, or anything that would not survive being used as a
  -- filename.
  if v_slug !~ '^[a-z][a-z0-9-]{0,39}$' then
    return json_build_object('ok', false, 'error', 'bad_slug');
  end if;

  -- Their own folder, and the file this slug names. Both halves: the
  -- folder stops one driver filing another's document, and the filename
  -- stops one slug's row pointing at a different slug's object, which
  -- would have an operator accepting an insurance certificate under the
  -- heading "Passport".
  if v_path is distinct from (v_uid::text || '/' || v_slug || '.pdf') then
    return json_build_object('ok', false, 'error', 'bad_path');
  end if;

  insert into public.driver_documents
              (driver_user_id, slug, path, status, reason, uploaded_at, reviewed_at, reviewed_by)
       values (v_uid, v_slug, v_path, 'uploaded', null, now(), null, null)
  on conflict (driver_user_id, slug) do update
          set path        = excluded.path,
              status      = 'uploaded',
              reason      = null,
              uploaded_at = now(),
              reviewed_at = null,
              reviewed_by = null;

  return json_build_object('ok', true, 'slug', v_slug);
end;
$$;

grant execute on function public.save_driver_document(text, text) to authenticated;


-- ── 5. admin_review_document — accept it, or say why not ────────────
-- The operator's half. Same shape as admin_set_driver_status: an
-- is_admin() check at the top, a vocabulary it will accept, and a where
-- clause that cannot go missing.
--
-- p_seen_at is the guard against reviewing a document you did not read.
-- It is the uploaded_at the board was showing when the operator opened
-- the file. A driver re-uploading between "View" and "Accept" is not a
-- hypothesis — it is the likeliest minute for them to do it, because a
-- rejection has just told them to. Without this, that accept lands on a
-- file nobody has opened, and the whole point of the screen is gone.
-- Null skips the check, for a caller that genuinely has not read the row.
--
-- A rejection with no reason is refused. This is the requirement the
-- whole feature turns on: a driver told "not accepted" with no sentence
-- attached cannot do anything except message somebody, which is the
-- process this replaces.
drop function if exists public.admin_review_document(uuid, text, text, text, timestamptz);
create function public.admin_review_document(
  p_driver_user_id uuid,
  p_slug           text,
  p_status         text,
  p_reason         text default null,
  p_seen_at        timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason    text := nullif(btrim(coalesce(p_reason, '')), '');
  v_uploaded  timestamptz;
  v_updated   integer;
  v_now       text;
  v_accepted  integer;
  v_status    text;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'error', 'not_admin');
  end if;

  -- The two words an operator may write. 'uploaded' is not one of them:
  -- it means "nobody has looked", and a review is by definition somebody
  -- having looked. Un-deciding a document is a re-upload by the driver,
  -- not a button here.
  if p_status not in ('accepted', 'rejected') then
    return json_build_object('ok', false, 'error', 'bad_status');
  end if;

  if p_status = 'rejected' and v_reason is null then
    return json_build_object('ok', false, 'error', 'need_reason');
  end if;

  select uploaded_at into v_uploaded
    from public.driver_documents
   where driver_user_id = p_driver_user_id and slug = p_slug;

  if v_uploaded is null then
    return json_build_object('ok', false, 'error', 'no_document');
  end if;

  if p_seen_at is not null and v_uploaded <> p_seen_at then
    -- Not an error, a change of facts. The board re-reads and shows the
    -- new copy rather than recording a decision about the old one.
    return json_build_object('ok', false, 'error', 'moved_on');
  end if;

  update public.driver_documents
     set status      = p_status,
         -- an accepted document carries no reason: leaving the last
         -- rejection's sentence on it would have the driver reading
         -- "the scan is cut off at the bottom" under a green tick
         reason      = case when p_status = 'rejected' then v_reason else null end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where driver_user_id = p_driver_user_id
     and slug = p_slug;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'no_document');
  end if;

  -- Read it back rather than trusting row_count, for the reason spelled
  -- out in docs/admin-schema.sql §4a: a matched row is not a moved
  -- value, and an operations tool that is confidently wrong is worse
  -- than one that is merely broken.
  select status into v_now
    from public.driver_documents
   where driver_user_id = p_driver_user_id and slug = p_slug;

  if v_now is distinct from p_status then
    return json_build_object('ok', false, 'error', 'not_applied', 'status', v_now);
  end if;

  -- What the operator gets to decide with. accepted_count is a count and
  -- not a verdict — this function has no idea how many documents Aruba
  -- currently asks for, because that list is TypeScript (section 3). The
  -- board compares it against its own list and says "all five in" or
  -- "three of five". Nothing here approves anybody.
  select count(*) into v_accepted
    from public.driver_documents
   where driver_user_id = p_driver_user_id and status = 'accepted';

  select status into v_status from public.drivers where user_id = p_driver_user_id;

  return json_build_object(
    'ok', true,
    'status', v_now,
    'accepted_count', v_accepted,
    'driver_status', v_status
  );
end;
$$;

grant execute on function public.admin_review_document(uuid, text, text, text, timestamptz) to authenticated;


-- ── 6. Nothing to run by hand ───────────────────────────────────────
-- Unlike docs/admin-schema.sql §6, this file bootstraps nothing. A
-- driver who already exists gets no documents rows and the portal shows
-- them five outstanding items, which is the truth: nobody has ever sent
-- Cabby's these files through the software before.
--
-- The three drivers approved before this file ran STAY approved. That is
-- deliberate — this is not a re-vetting exercise, and revoking a working
-- driver's status because a table is new would put a car on a kerb with
-- nobody in it. Their documents show as outstanding on the Drivers board
-- and can be collected in their own time.


-- ── 7. The guest half of onboarding needs no migration ──────────────
-- Saving a traveller's name and number to their account after they book
-- is a write to user_metadata, which the account holder owns and can
-- write through supabase.auth.updateUser() — see the note on
-- updateProfile in src/booking/useAuth.ts, and src/pages/Profile.tsx,
-- which has been reading and writing exactly those two fields since it
-- was built. Nothing downstream trusts them, so there is no table, no
-- policy and nothing to run here.
