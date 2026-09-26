-- =====================================================
-- Outreach queue, claim links, and outreach reporting — internal only
-- =====================================================
-- outreach_queue       songs waiting to be scored by the scheduled worker
--                      (GET /api/cron/outreach-queue), which runs each one
--                      through the SAME batch-scan path the admin endpoint
--                      uses and links the resulting outreach_batch_items row.
-- claim fields         a DM recipient opens /claim/[token], signs in with a
--                      magic link, and receives their OWN copy of the
--                      pre-generated analysis and report plus the entitlement
--                      that shows it unlocked in My Songs.
-- outreach_events      claim_opened / claimed, for DM → claim → purchase.
-- outreach_status      one reporting view over all of it.
--
-- Additive only. Nothing here changes scoring, reports, Stripe or auth.
--
-- SECURITY. Every table and the view are service-role only: RLS on with no
-- policies, every default grant revoked from anon/authenticated. Functions
-- are executable by service_role only.
-- =====================================================

-- ── Queue ────────────────────────────────────────────────────────────────
create table if not exists outreach_queue (
  id               uuid        primary key default gen_random_uuid(),
  batch_id         text        not null,
  artist           text        not null,
  track            text        not null,
  instagram        text,
  segment          text,
  status           text        not null default 'pending' check (status in (
                     'pending', 'processing', 'done', 'failed', 'skipped')),
  attempts         integer     not null default 0,
  lease_until      timestamptz,
  outreach_item_id uuid        references outreach_batch_items(id) on delete set null,
  -- Why a row was skipped or failed (machine reason, never shown to a creator).
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- The same song is never queued twice, whatever the casing.
create unique index if not exists outreach_queue_song_uidx
  on outreach_queue (lower(artist), lower(track));
create index if not exists outreach_queue_claimable_idx
  on outreach_queue (status, created_at) where status in ('pending', 'processing');
create index if not exists outreach_queue_batch_idx
  on outreach_queue (batch_id, created_at);

drop trigger if exists outreach_queue_set_updated_at on outreach_queue;
create trigger outreach_queue_set_updated_at
  before update on outreach_queue
  for each row execute function set_updated_at();

alter table outreach_queue enable row level security;
revoke all on table outreach_queue from public;
revoke all on table outreach_queue from anon, authenticated;
grant select, insert, update, delete on table outreach_queue to service_role;

-- ── Claim fields on the scored row ───────────────────────────────────────
alter table outreach_batch_items
  add column if not exists segment            text,
  add column if not exists claim_token        text unique,
  add column if not exists claim_url          text,
  add column if not exists claimed_at         timestamptz,
  add column if not exists claimed_by_creator uuid references creators(id) on delete set null;

-- ── Events ───────────────────────────────────────────────────────────────
create table if not exists outreach_events (
  id               uuid        primary key default gen_random_uuid(),
  event            text        not null check (event in ('claim_opened', 'claimed')),
  batch_id         text,
  scan_id          text,
  outreach_item_id uuid        references outreach_batch_items(id) on delete set null,
  creator_id       uuid,
  created_at       timestamptz not null default now()
);

create index if not exists outreach_events_item_idx
  on outreach_events (outreach_item_id, created_at);

alter table outreach_events enable row level security;
revoke all on table outreach_events from public;
revoke all on table outreach_events from anon, authenticated;
grant select, insert, update, delete on table outreach_events to service_role;

-- ── Lease: claim up to p_limit rows, atomically ──────────────────────────
-- A row is claimable when pending, or when a previous run's lease ran out
-- (the function died mid-row). SKIP LOCKED means two overlapping runs never
-- take the same row. A stale row that has already used every attempt is
-- failed here instead of being retried forever.
create or replace function claim_outreach_queue(
  p_limit integer,
  p_lease_seconds integer,
  p_max_attempts integer
) returns setof outreach_queue
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if p_limit is null or p_limit < 1 or p_lease_seconds is null or p_lease_seconds < 1
     or p_max_attempts is null or p_max_attempts < 1 then
    raise exception 'claim_outreach_queue: invalid arguments';
  end if;

  update outreach_queue
     set status = 'failed', error = coalesce(error, 'lease_expired'), lease_until = null
   where status = 'processing' and lease_until < now() and attempts >= p_max_attempts;

  return query
  update outreach_queue q
     set status = 'processing',
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = q.attempts + 1
   where q.id in (
     select c.id from outreach_queue c
      where c.status = 'pending'
         or (c.status = 'processing' and c.lease_until < now())
      order by c.created_at, c.id
      limit p_limit
      for update skip locked
   )
  returning q.*;
end $$;

-- ── Claim: copy the outreach analysis + report to the creator ────────────
-- One transaction: the song, its version, the analysis, the report, the
-- entitlement, the claimed_at stamp and the 'claimed' event land together
-- or not at all. The outreach identity keeps its own copy, so the batch's
-- reuse-by-ISRC keeps working. The claimed report is the creator's included
-- first report when they have not used it (same marker free-first uses);
-- otherwise it is its own zero-cost grant keyed to this outreach item.
--
-- Outcomes: claimed | already_yours | used | expired | invalid | unavailable
create or replace function claim_outreach_item(
  p_token text,
  p_creator uuid,
  p_expires_at timestamptz,
  p_track_limit integer,
  p_ttl_days integer default 30
) returns table (outcome text, out_scan_id text, out_batch_id text, out_item_id uuid)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_item      outreach_batch_items%rowtype;
  v_analysis  analyses%rowtype;
  v_report    reports%rowtype;
  v_song      songs%rowtype;
  v_song_id   uuid;
  v_version   uuid;
  v_new_an    uuid;
  v_marker    text;
begin
  if p_token is null or length(p_token) < 16 or p_creator is null then
    return query select 'invalid'::text, null::text, null::text, null::uuid;
    return;
  end if;

  select * into v_item from outreach_batch_items where claim_token = p_token for update;
  if not found then
    return query select 'invalid'::text, null::text, null::text, null::uuid;
    return;
  end if;

  if v_item.claimed_at is not null then
    return query select
      (case when v_item.claimed_by_creator = p_creator then 'already_yours' else 'used' end)::text,
      v_item.scan_id, v_item.batch_id, v_item.id;
    return;
  end if;

  if v_item.created_at < now() - make_interval(days => p_ttl_days) then
    return query select 'expired'::text, v_item.scan_id, v_item.batch_id, v_item.id;
    return;
  end if;

  select * into v_analysis from analyses where id = v_item.analysis_id;
  if not found or v_analysis.creator_id = p_creator then
    return query select 'unavailable'::text, v_item.scan_id, v_item.batch_id, v_item.id;
    return;
  end if;
  select * into v_report from reports where analysis_id = v_analysis.id;
  if not found then
    return query select 'unavailable'::text, v_item.scan_id, v_item.batch_id, v_item.id;
    return;
  end if;
  select * into v_song from songs where id = v_analysis.song_id;

  -- Song: one row per (creator, track_key), exactly as the scan path keeps it.
  insert into songs (creator_id, title, artist_name, isrc, track_key, source)
  values (p_creator, v_song.title, v_song.artist_name, v_song.isrc, v_song.track_key, v_song.source)
  on conflict (creator_id, track_key) do update set updated_at = now()
  returning id into v_song_id;

  select id into v_version from song_versions
   where song_id = v_song_id and label = 'original' order by created_at limit 1;
  if v_version is null then
    insert into song_versions (song_id, label, source)
    values (v_song_id, 'original', v_song.source)
    returning id into v_version;
  end if;

  insert into song_external_ids (song_id, provider, external_id)
  select v_song_id, provider, external_id from song_external_ids where song_id = v_song.id
  on conflict do nothing;

  insert into analyses (creator_id, song_id, song_version_id, scan_id, status, epi_score, mode,
                        verdict, verdict_rationale, scores, circumplex, engine_version, source, analyzed_at)
  values (p_creator, v_song_id, v_version, v_analysis.scan_id, v_analysis.status, v_analysis.epi_score,
          v_analysis.mode, v_analysis.verdict, v_analysis.verdict_rationale, v_analysis.scores,
          v_analysis.circumplex, v_analysis.engine_version, v_analysis.source, v_analysis.analyzed_at)
  on conflict (creator_id, scan_id) do nothing;
  select id into v_new_an from analyses where creator_id = p_creator and scan_id = v_analysis.scan_id;

  insert into reports (analysis_id, creator_id, scan_id, payload, generator_version, model)
  values (v_new_an, p_creator, v_analysis.scan_id, v_report.payload, v_report.generator_version, v_report.model)
  on conflict do nothing;

  if not exists (
    select 1 from entitlements
     where user_id = p_creator and offer = 'song_intelligence' and scan_id = v_analysis.scan_id
  ) then
    v_marker := 'free_first_' || p_creator::text;
    if exists (select 1 from entitlements where stripe_checkout_session_id = v_marker) then
      v_marker := 'outreach_claim_' || v_item.id::text;
    end if;
    insert into entitlements (user_id, offer, scan_id, track_slug, stripe_checkout_session_id,
                              amount_total_cents, currency, track_limit, status, expires_at)
    values (p_creator, 'song_intelligence', v_analysis.scan_id, v_song.track_key, v_marker,
            0, 'usd', p_track_limit, 'active', p_expires_at);
  end if;

  update outreach_batch_items
     set claimed_at = now(), claimed_by_creator = p_creator
   where id = v_item.id;

  insert into outreach_events (event, batch_id, scan_id, outreach_item_id, creator_id)
  values ('claimed', v_item.batch_id, v_analysis.scan_id, v_item.id, p_creator);

  return query select 'claimed'::text, v_analysis.scan_id, v_item.batch_id, v_item.id;
end $$;

revoke execute on function claim_outreach_queue(integer, integer, integer) from public, anon, authenticated;
grant execute on function claim_outreach_queue(integer, integer, integer) to service_role;
revoke execute on function claim_outreach_item(text, uuid, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function claim_outreach_item(text, uuid, timestamptz, integer, integer) to service_role;

-- ── Reporting view ───────────────────────────────────────────────────────
-- paid_after_claim: the claimer bought something (a real Stripe amount)
-- after claiming — song #2 at $19, or Creator Intelligence.
create or replace view outreach_status with (security_invoker = true) as
select
  q.batch_id,
  q.artist,
  q.track,
  q.instagram,
  q.segment,
  q.status                              as queue_status,
  q.attempts,
  coalesce(q.error, i.reason)           as reason,
  i.status                              as item_status,
  i.scan_id,
  i.mode,
  i.epi_score,
  i.finding,
  i.finding_candidates,
  i.claim_url,
  i.claimed_at,
  i.claimed_by_creator,
  exists (
    select 1 from entitlements e
     where e.user_id = i.claimed_by_creator
       and e.granted_at > i.claimed_at
       and coalesce(e.amount_total_cents, 0) > 0
       and e.status <> 'refunded'
  )                                     as paid_after_claim,
  q.created_at                          as queued_at,
  q.updated_at
from outreach_queue q
left join outreach_batch_items i on i.id = q.outreach_item_id;

revoke all on table outreach_status from public;
revoke all on table outreach_status from anon, authenticated;
grant select on table outreach_status to service_role;
