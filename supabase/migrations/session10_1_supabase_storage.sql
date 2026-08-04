-- ============================================================================
-- Pacific Data Commons — Session 10.1 Migration
-- Switch upload storage from Cloudflare R2 to Supabase Storage
-- ============================================================================

-- ── 1. RENAME r2_key -> storage_path ────────────────────────────────────
-- uploaded_files.r2_key held a Cloudflare R2 object key. It now holds a
-- Supabase Storage object path (`${providerId}/${filename}` in the
-- pdc-uploads bucket) — same role, different backend, so this is a rename
-- rather than a new column. Data-preserving.
ALTER TABLE uploaded_files RENAME COLUMN r2_key TO storage_path;

COMMENT ON COLUMN uploaded_files.storage_path IS
  'Supabase Storage object path in the pdc-uploads bucket — used to retrieve and delete. Format: {provider_id}/{filename}.';

-- ── 2. CREATE THE pdc-uploads BUCKET ────────────────────────────────────
-- Private bucket — raw provider uploads are never publicly readable
-- (CLAUDE.md P1: data sovereignty; these are also deleted immediately
-- after the AI formatting pipeline finishes with them, P5). Only the
-- service-role key (server-side only) can read/delete objects here.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pdc-uploads', 'pdc-uploads', false, 524288000) -- 500MB, matches ACCEPTED file size cap
ON CONFLICT (id) DO NOTHING;

-- ── 3. RLS ON storage.objects FOR THIS BUCKET ───────────────────────────
-- Onboarding uses a custom session-token scheme (lib/onboarding/session.ts),
-- not Supabase Auth — the browser has only the public anon key, no
-- authenticated JWT, when it uploads directly to Supabase Storage's
-- resumable (TUS) endpoint (lib/upload/chunked.ts). RLS on storage.objects
-- therefore cannot scope INSERT to "this caller's own provider_id" the way
-- an authenticated-user policy could (anon carries no identity to check).
--
-- The actual authorization gate is application-layer: initUpload()
-- (actions/upload/init-upload.ts) validates providerId + sessionToken
-- BEFORE handing back an object path, and completeUpload()
-- (actions/upload/complete-upload.ts) refuses to create a durable
-- uploaded_files record for any object path outside the caller's own
-- provider prefix. A stray object written straight to the bucket without
-- going through that flow can occupy storage but can never become a
-- processed, provider-visible file. Flagged as a known residual gap (an
-- anon holder of the public key could still write junk objects anywhere
-- in this bucket) — tightening this further needs either a per-upload
-- signed-URL/token scheme or moving upload authorization onto Supabase
-- Auth, both bigger changes than this session's scope.
CREATE POLICY pdc_uploads_anon_insert ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'pdc-uploads');

-- No SELECT/UPDATE/DELETE policy for anon or authenticated — reads and
-- deletes happen only via the service-role client (bypasses RLS), from
-- server actions (actions/upload/delete-uploaded-file.ts) or the (separate,
-- not-yet-built) AI formatting pipeline service.
