-- =====================================================
-- CHRP Song Intelligence (Analyzer) — song memory (V2)
-- =====================================================
-- Apply AFTER 0001_analyzer_commerce.sql. Additive only: 0001 establishes
-- entitlements, entitlement_tracks and the Stripe event ledger; this
-- migration adds the durable memory those entitlements point at.
--
-- The product principle this encodes: Supabase is an INVISIBLE memory
-- layer. A creator never re-supplies anything CHRP has already learned.
-- Everything below exists so that a returning creator — on a new browser,
-- after a magic link — gets their songs, their analyses, their reports and
-- their true remaining credit balance without being asked a single
-- question.
--
-- Authority rule: every table here denies by default under RLS. Owners may
-- READ their own rows for presentation. Nothing is writable from the
-- browser; all writes happen through the service role in server routes,
-- which is also the only thing Stripe's webhook can reach.
-- =====================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =====================================================
-- ENUMS
-- =====================================================

-- Where a song's audio/metadata came from. `direct_upload` exists from day
-- one so an unreleased song, demo or alternate mix is representable without
-- a schema change when the upload path ships.
do $$ begin
  create type song_source as enum ('spotify','soundcharts','direct_upload');
exception when duplicate_object then null; end $$;

do $$ begin
  create type analysis_status as enum ('pending','complete','failed');
exception when duplicate_object then null; end $$;

-- =====================================================
-- CREATORS  (identity)
-- =====================================================
-- One row per auth.users row. Anonymous sign-in creates the auth user; the
-- magic-link upgrade attaches the email to the SAME row, which is what makes
-- a returning creator on another device resolve to their existing catalog.
create table if not exists creators (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists creators_email_idx on creators (email);

alter table creators enable row level security;

drop policy if exists creators_select_own on creators;
create policy creators_select_own on creators
  for select using (auth.uid() = id);

-- =====================================================
-- SONGS
-- =====================================================
-- A song as CHRP knows it, owned by exactly one creator. Ownership is what
-- makes cross-creator isolation enforceable: every downstream row reaches
-- its owner through songs.creator_id.
create table if not exists songs (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references creators(id) on delete cascade,
  title        text not null,
  artist_name  text,
  isrc         text,
  -- Stable per-creator identity for a song. For catalog tracks this is the
  -- track slug; for uploads it is a derived handle. It is the key the credit
  -- ledger counts distinctness on, so re-scanning one song never bills twice.
  track_key    text not null,
  source       song_source not null default 'soundcharts',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists songs_creator_track_key_uidx
  on songs (creator_id, track_key);
create index if not exists songs_creator_idx on songs (creator_id);
create index if not exists songs_isrc_idx on songs (isrc) where isrc is not null;

alter table songs enable row level security;

drop policy if exists songs_select_own on songs;
create policy songs_select_own on songs
  for select using (auth.uid() = creator_id);

-- =====================================================
-- SONG VERSIONS
-- =====================================================
-- A specific rendition of a song: the released master, a demo, an alternate
-- mix, or a directly uploaded file. Analyses attach to a VERSION, not to a
-- song, so re-analysing a new mix later is a first-class operation rather
-- than an overwrite of history.
create table if not exists song_versions (
  id                 uuid primary key default gen_random_uuid(),
  song_id            uuid not null references songs(id) on delete cascade,
  label              text not null default 'original',
  source             song_source not null,
  -- direct_upload only. Path of the object in the private Storage bucket;
  -- the audio bytes themselves never live in Postgres.
  audio_storage_path text,
  audio_mime         text,
  duration_seconds   integer,
  created_at         timestamptz not null default now(),

  -- An uploaded version must say where its audio lives; a streaming-sourced
  -- version must not pretend to own an object it never uploaded.
  constraint upload_has_path check (
    (source <> 'direct_upload' and audio_storage_path is null)
    or (source = 'direct_upload' and audio_storage_path is not null)
  )
);

create index if not exists song_versions_song_idx on song_versions (song_id);

alter table song_versions enable row level security;

drop policy if exists song_versions_select_own on song_versions;
create policy song_versions_select_own on song_versions
  for select using (
    exists (
      select 1 from songs s
      where s.id = song_versions.song_id and s.creator_id = auth.uid()
    )
  );

-- =====================================================
-- EXTERNAL IDENTIFIERS
-- =====================================================
-- Spotify / Soundcharts handles kept out of the songs table so a song can
-- carry several, and so a directly uploaded song can carry none.
create table if not exists song_external_ids (
  id          uuid primary key default gen_random_uuid(),
  song_id     uuid not null references songs(id) on delete cascade,
  provider    text not null check (provider in ('spotify','soundcharts','isrc')),
  external_id text not null,
  created_at  timestamptz not null default now(),
  unique (song_id, provider, external_id)
);

create index if not exists song_external_ids_lookup_idx
  on song_external_ids (provider, external_id);

alter table song_external_ids enable row level security;

drop policy if exists song_external_ids_select_own on song_external_ids;
create policy song_external_ids_select_own on song_external_ids
  for select using (
    exists (
      select 1 from songs s
      where s.id = song_external_ids.song_id and s.creator_id = auth.uid()
    )
  );

-- =====================================================
-- ANALYSES
-- =====================================================
-- One engine run over one song version. This table IS the creator's catalog
-- history: what was analysed, when, by which engine version, and what the
-- scoring said. `scan_id` is the user-facing handle carried in URLs.
--
-- Only status='complete' rows represent a finished analysis. A failed run
-- stays on the record as 'failed' and — critically — never consumes a credit.
create table if not exists analyses (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references creators(id) on delete cascade,
  song_id         uuid not null references songs(id) on delete cascade,
  song_version_id uuid references song_versions(id) on delete set null,

  scan_id         text not null,
  status          analysis_status not null default 'pending',

  -- Engine output. Kept as columns where it is queried, jsonb where it is
  -- only ever read back whole.
  epi_score       integer,
  mode            text,
  verdict         text,
  -- Why the engine reached that verdict, in CHRP's voice. The paid report
  -- renders this and the generator consumes it as an input; the model is
  -- never asked to author it, because that would be a claim the scoring
  -- never made. The scoring pipeline must populate this.
  verdict_rationale text,
  scores          jsonb,
  circumplex      jsonb,

  engine_version  text not null,
  source          song_source not null,

  analyzed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- A scan handle is unique per creator, so a refresh of the same scan is the
-- same row rather than a second analysis.
create unique index if not exists analyses_creator_scan_uidx
  on analyses (creator_id, scan_id);
create index if not exists analyses_creator_idx on analyses (creator_id);
create index if not exists analyses_song_idx on analyses (song_id);

alter table analyses enable row level security;

drop policy if exists analyses_select_own on analyses;
create policy analyses_select_own on analyses
  for select using (auth.uid() = creator_id);

-- =====================================================
-- REPORTS  (persisted paid intelligence)
-- =====================================================
-- The generated paid report, stored once so an authorized re-read does not
-- re-invoke the model. Deliberately NOT readable by the owner under RLS:
-- paid intelligence is served only through the entitlement-checked API
-- route, so holding a session is never sufficient to read it directly.
create table if not exists reports (
  id                uuid primary key default gen_random_uuid(),
  analysis_id       uuid not null references analyses(id) on delete cascade,
  creator_id        uuid not null references creators(id) on delete cascade,
  scan_id           text not null,

  payload           jsonb not null,
  generator_version text not null,
  model             text,

  created_at        timestamptz not null default now()
);

create unique index if not exists reports_analysis_uidx on reports (analysis_id);
create unique index if not exists reports_creator_scan_uidx
  on reports (creator_id, scan_id);

alter table reports enable row level security;
-- No policies. Service role only, reached exclusively via assertReportAccess.

-- =====================================================
-- CREDIT LEDGER
-- =====================================================
-- 0001 created entitlement_tracks keyed on scan_id. Credit distinctness is a
-- property of the SONG, not of the scan handle: two scans of one song must
-- cost one credit. `track_key` carries that identity and is the column the
-- ceiling is counted on.
alter table entitlement_tracks
  add column if not exists track_key   text,
  add column if not exists analysis_id uuid references analyses(id) on delete set null;

-- Backfill for any rows written before this migration.
update entitlement_tracks
   set track_key = coalesce(track_key, track_slug, scan_id)
 where track_key is null;

alter table entitlement_tracks
  alter column track_key set not null;

-- The ceiling and the no-double-charge guarantee are both this index.
create unique index if not exists entitlement_tracks_key_uidx
  on entitlement_tracks (entitlement_id, track_key);

-- =====================================================
-- updated_at triggers
-- =====================================================
-- set_updated_at() is created in 0001.
drop trigger if exists creators_set_updated_at on creators;
create trigger creators_set_updated_at
  before update on creators
  for each row execute function set_updated_at();

drop trigger if exists songs_set_updated_at on songs;
create trigger songs_set_updated_at
  before update on songs
  for each row execute function set_updated_at();

drop trigger if exists analyses_set_updated_at on analyses;
create trigger analyses_set_updated_at
  before update on analyses
  for each row execute function set_updated_at();

-- =====================================================
-- creator row follows the auth user
-- =====================================================
-- Anonymous sign-in must not require a round trip before a scan can be
-- attributed, so the creators row is minted by trigger the moment the auth
-- user exists. The magic-link upgrade later fills in the email on the SAME
-- row, which is what makes cross-device return work.
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into creators (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = coalesce(excluded.email, creators.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function handle_new_auth_user();
