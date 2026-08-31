-- =====================================================
-- CHRP Song Intelligence (Analyzer) — commerce + entitlement (V1)
-- =====================================================
-- Apply via the Supabase SQL editor (paste & run) or psql, following the
-- same convention as chrp-athlete-engine/db.
--
-- What this establishes:
--   * Server-side entitlement records. The browser is never the source of
--     truth for whether a paid report may be served.
--   * A Stripe event ledger so webhook delivery is idempotent.
--   * Durable per-entitlement track attachment, so a Creator Intelligence
--     buyer cannot increment their own 10-track allowance from the client.
--
-- Identity: Supabase Auth. A first-time visitor is signed in anonymously
-- (auth.users row, HttpOnly cookie via @supabase/ssr) so a scan can be
-- attributed without a front-door login. At save/purchase time the same
-- user is upgraded to an email identity via magic link — no new identity
-- system, no password.
--
-- RLS: every table denies by default. Entitlements are readable by their
-- owner for presentation only; they are GRANTED exclusively by the Stripe
-- webhook running under the service role, which bypasses RLS.
-- =====================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- =====================================================
-- ENUMS
-- =====================================================
do $$ begin
  create type analyzer_offer as enum ('song_intelligence','creator_intelligence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entitlement_status as enum ('active','revoked','refunded');
exception when duplicate_object then null; end $$;

-- =====================================================
-- STRIPE EVENT LEDGER  (webhook idempotency)
-- =====================================================
-- The unique constraint on stripe_event_id is the idempotency mechanism:
-- a repeated delivery of the same event loses the insert race and is
-- acknowledged without granting a second entitlement.
create table if not exists stripe_events (
  stripe_event_id text primary key,
  type            text not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  payload_digest  text
);

alter table stripe_events enable row level security;
-- No policies: unreachable from anon/authenticated. Service role only.

-- =====================================================
-- ENTITLEMENTS
-- =====================================================
create table if not exists entitlements (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users(id) on delete cascade,
  offer                      analyzer_offer not null,

  -- Song Intelligence is bound to exactly one scan. Creator Intelligence
  -- is bound to the buyer and accumulates scans in entitlement_tracks.
  scan_id                    text,
  track_slug                 text,

  -- Stripe references. checkout_session_id is unique, so replaying the
  -- same completed session can never mint a second entitlement.
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  stripe_customer_id         text,
  amount_total_cents         integer,
  currency                   text,

  track_limit                integer,          -- 1 for song, 10 for creator
  status                     entitlement_status not null default 'active',
  granted_at                 timestamptz not null default now(),
  expires_at                 timestamptz not null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint song_offer_has_scan
    check (offer <> 'song_intelligence' or scan_id is not null)
);

create index if not exists entitlements_user_idx     on entitlements (user_id);
create index if not exists entitlements_scan_idx     on entitlements (scan_id);
create unique index if not exists entitlements_song_unique
  on entitlements (user_id, scan_id)
  where offer = 'song_intelligence';

alter table entitlements enable row level security;

-- Owners may READ their own entitlements (for presentation only).
-- There is deliberately no insert/update/delete policy: grants happen
-- exclusively through the service-role webhook.
drop policy if exists entitlements_select_own on entitlements;
create policy entitlements_select_own on entitlements
  for select using (auth.uid() = user_id);

-- =====================================================
-- ENTITLEMENT TRACKS  (Creator Intelligence usage)
-- =====================================================
-- One row per scan attached to a catalog entitlement. The 10-track ceiling
-- is enforced server-side against COUNT(*) here, never against a number
-- supplied by the browser.
create table if not exists entitlement_tracks (
  id             uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references entitlements(id) on delete cascade,
  scan_id        text not null,
  track_slug     text,
  attached_at    timestamptz not null default now(),
  unique (entitlement_id, scan_id)
);

create index if not exists entitlement_tracks_ent_idx on entitlement_tracks (entitlement_id);

alter table entitlement_tracks enable row level security;

drop policy if exists entitlement_tracks_select_own on entitlement_tracks;
create policy entitlement_tracks_select_own on entitlement_tracks
  for select using (
    exists (
      select 1 from entitlements e
      where e.id = entitlement_tracks.entitlement_id
        and e.user_id = auth.uid()
    )
  );

-- =====================================================
-- updated_at trigger
-- =====================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entitlements_set_updated_at on entitlements;
create trigger entitlements_set_updated_at
  before update on entitlements
  for each row execute function set_updated_at();
