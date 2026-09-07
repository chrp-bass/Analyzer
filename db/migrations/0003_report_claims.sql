-- =====================================================
-- CHRP Song Intelligence (Analyzer) — report preparation claims (V3)
-- =====================================================
-- Apply AFTER 0002_song_memory.sql. Additive only: one new table plus four
-- functions. No change to any existing table, column, index or policy.
--
-- WHY THIS TABLE EXISTS (and why the reports table could not do the job):
--
-- Paid fulfillment must acquire a durable, database-level, atomic claim
-- BEFORE any upstream work runs — before Soundcharts, before the enrichment
-- endpoints, before Anthropic — so that when N requests for the same scan
-- arrive on N separate Vercel instances, exactly ONE performs generation and
-- the rest poll for readiness having done zero upstream work.
--
-- The `reports` table cannot be that lock: `reports.analysis_id` is NOT NULL
-- and references `analyses(id)`, so a `reports` row cannot be inserted until
-- the analysis (itself a Soundcharts call) already exists.
--
-- FENCING. A lease is not identified by time. Each acquisition and each
-- takeover mints a fresh immutable `lease_token` (uuid) and bumps a
-- monotonically increasing `fence`. Every mutation — renew, complete,
-- release — is gated on `(creator_id, scan_id, worker, lease_token)`, so a
-- worker that lost the lease to a takeover can neither renew it, overwrite the
-- report, mark preparation complete, nor delete the successor's lease.
--
-- DB TIME. Freshness and renewal use `now()` inside the database, never an
-- application instance's clock.
--
-- ATOMIC COMPLETION. `complete_report` validates inputs, lease ownership, the
-- claimed version and payload completeness, then writes the report and deletes
-- the lease — all in ONE function body / transaction. No unfenced UPSERT
-- followed by a separate DELETE.
--
-- SECURITY. Every function pins a fixed `search_path`, is SECURITY INVOKER,
-- has EXECUTE revoked from PUBLIC / anon / authenticated and granted only to
-- service_role. The table has RLS on with no policies and no anon/authenticated
-- privileges — no client can read or write a claim by any path.
-- =====================================================

create extension if not exists "pgcrypto";

create table if not exists report_claims (
  creator_id     uuid        not null references creators(id) on delete cascade,
  scan_id        text        not null,
  -- The instance/attempt that currently holds the lease.
  worker         text        not null,
  -- Immutable per acquisition. Re-minted on every takeover, so a superseded
  -- worker's token can never match the current lease again.
  lease_token    uuid        not null default gen_random_uuid(),
  -- Monotonically increasing across takeovers of one lease lineage.
  fence          bigint      not null default 1,
  report_version text        not null,
  claimed_at     timestamptz not null default now(),
  primary key (creator_id, scan_id)
);

create index if not exists report_claims_claimed_at_idx
  on report_claims (claimed_at);

-- ── RLS + table privileges: no client access. ──────────────────────────────
-- RLS with no policies denies anon/authenticated every operation; the explicit
-- REVOKEs remove the broad default grants Supabase gives new public tables.
-- service_role (which the server uses and which bypasses RLS) keeps access.
alter table report_claims enable row level security;
revoke all on table report_claims from public;
revoke all on table report_claims from anon, authenticated;
grant select, insert, update, delete on table report_claims to service_role;

-- =====================================================
-- claim_report_lease — atomic acquire-or-takeover, BEFORE any upstream work
-- =====================================================
-- Returns:
--   one row (acquired = true)  → this caller holds the lease; use lease_token/fence.
--   one row (acquired = false) → a complete current-version report already exists.
--   zero rows                  → a FRESH lease is held by someone else; poll.
create or replace function claim_report_lease(
  p_creator uuid,
  p_scan text,
  p_worker text,
  p_version text,
  p_stale_seconds integer
) returns table (acquired boolean, out_token uuid, out_fence bigint, out_claimed_at timestamptz)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_token   uuid;
  v_fence   bigint;
  v_claimed timestamptz;
begin
  -- Input validation.
  if p_creator is null
     or p_scan is null or length(p_scan) = 0
     or p_worker is null or length(p_worker) = 0
     or p_version is null or length(p_version) = 0
     or p_stale_seconds is null or p_stale_seconds < 1 then
    raise exception 'claim_report_lease: invalid arguments';
  end if;

  -- Pre-check: a complete report on the current version already exists →
  -- nobody claims.
  if exists (
    select 1 from reports r
    where r.creator_id = p_creator
      and r.scan_id = p_scan
      and r.generator_version = p_version
      and coalesce(r.payload->>'signature', '') <> ''
      and coalesce(r.payload->>'rhodes', '') <> ''
      and coalesce(r.payload->>'throughline', '') <> ''
      and jsonb_typeof(r.payload->'placements') = 'array'
      and jsonb_array_length(r.payload->'placements') > 0
  ) then
    return query select false, null::uuid, null::bigint, null::timestamptz;
    return;
  end if;

  -- The atomic claim. A fresh conflicting lease makes the WHERE false, so no
  -- row is updated or returned (zero rows → held); a stale one is taken over
  -- with a NEW token and fence+1. Concurrent takeovers serialise on the row
  -- lock: the second re-evaluates the WHERE against the refreshed row.
  insert into report_claims as rc (creator_id, scan_id, worker, lease_token, fence, report_version, claimed_at)
  values (p_creator, p_scan, p_worker, gen_random_uuid(), 1, p_version, now())
  on conflict (creator_id, scan_id) do update
    set worker = excluded.worker,
        lease_token = gen_random_uuid(),
        fence = rc.fence + 1,
        report_version = excluded.report_version,
        claimed_at = now()
    where rc.claimed_at < now() - make_interval(secs => p_stale_seconds)
  returning rc.lease_token, rc.fence, rc.claimed_at
  into v_token, v_fence, v_claimed;

  -- Zero rows (a FRESH lease is held by someone else) → held; poll.
  if v_token is null then
    return; -- empty result set
  end if;

  -- RE-CHECK after acquiring. The pre-check ran on an earlier snapshot; a
  -- completer may have COMMITTED a complete report for this version while our
  -- INSERT/takeover was blocked behind its row lock. If a complete report now
  -- exists, RELEASE the lease we just took and return READY — no upstream work
  -- is done. Each statement here runs on a fresh snapshot under READ
  -- COMMITTED, so this observes the completer's committed row.
  if exists (
    select 1 from reports r
    where r.creator_id = p_creator
      and r.scan_id = p_scan
      and r.generator_version = p_version
      and coalesce(r.payload->>'signature', '') <> ''
      and coalesce(r.payload->>'rhodes', '') <> ''
      and coalesce(r.payload->>'throughline', '') <> ''
      and jsonb_typeof(r.payload->'placements') = 'array'
      and jsonb_array_length(r.payload->'placements') > 0
  ) then
    delete from report_claims
     where creator_id = p_creator
       and scan_id = p_scan
       and worker = p_worker
       and lease_token = v_token;
    return query select false, null::uuid, null::bigint, null::timestamptz;
    return;
  end if;

  return query select true, v_token, v_fence, v_claimed;
end;
$$;

-- =====================================================
-- renew_report_lease — heartbeat, using DB time, fenced on the token
-- =====================================================
create or replace function renew_report_lease(
  p_creator uuid,
  p_scan text,
  p_worker text,
  p_token uuid
) returns table (out_fence bigint)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
begin
  if p_creator is null
     or p_scan is null or length(p_scan) = 0
     or p_worker is null or length(p_worker) = 0
     or p_token is null then
    raise exception 'renew_report_lease: invalid arguments';
  end if;

  return query
  update report_claims
     set claimed_at = now()
   where creator_id = p_creator
     and scan_id = p_scan
     and worker = p_worker
     and lease_token = p_token
  returning fence;
end;
$$;

-- =====================================================
-- complete_report — atomic: validate + persist report + release lease, fenced
-- =====================================================
-- ONE transaction. It validates inputs, then (inside the transaction)
-- ownership AND the claimed version — the lease must still be held by this
-- (worker, token) AND have been claimed for p_version — and refuses an
-- incomplete payload. Only then does it UPSERT the report and DELETE the
-- lease together. Ownership/version lost ⇒ ok = false, nothing written.
create or replace function complete_report(
  p_creator uuid,
  p_scan text,
  p_worker text,
  p_token uuid,
  p_analysis uuid,
  p_payload jsonb,
  p_version text,
  p_model text
) returns table (ok boolean, out_report_id uuid)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id uuid;
begin
  -- Input validation.
  if p_creator is null
     or p_scan is null or length(p_scan) = 0
     or p_worker is null or length(p_worker) = 0
     or p_token is null
     or p_analysis is null
     or p_payload is null
     or p_version is null or length(p_version) = 0 then
    raise exception 'complete_report: invalid arguments';
  end if;

  -- Fenced ownership AND version, LOCKED for the rest of the transaction.
  -- SELECT … FOR UPDATE takes a row lock on the matching lease so a concurrent
  -- claim_report_lease takeover of the same row BLOCKS until this transaction
  -- commits — closing the window between validating ownership and writing the
  -- report. If a takeover already won, the row no longer matches this
  -- (worker, token, version) and FOUND is false, so nothing is written.
  perform 1
    from report_claims
   where creator_id = p_creator
     and scan_id = p_scan
     and worker = p_worker
     and lease_token = p_token
     and report_version = p_version
   for update;
  if not found then
    return query select false, null::uuid;
    return;
  end if;

  -- Never persist an incomplete report. The reports row invariant is that a
  -- present row is a complete report, so a partial payload is refused outright.
  if coalesce(p_payload->>'signature', '') = ''
     or coalesce(p_payload->>'rhodes', '') = ''
     or coalesce(p_payload->>'throughline', '') = ''
     or jsonb_typeof(p_payload->'placements') <> 'array'
     or jsonb_array_length(p_payload->'placements') < 1 then
    raise exception 'complete_report: refusing to persist an incomplete payload';
  end if;

  insert into reports (creator_id, scan_id, analysis_id, payload, generator_version, model)
  values (p_creator, p_scan, p_analysis, p_payload, p_version, p_model)
  on conflict (creator_id, scan_id) do update
    set analysis_id = excluded.analysis_id,
        payload = excluded.payload,
        generator_version = excluded.generator_version,
        model = excluded.model
  returning id into v_id;

  delete from report_claims
  where creator_id = p_creator
    and scan_id = p_scan
    and worker = p_worker
    and lease_token = p_token;

  return query select true, v_id;
end;
$$;

-- =====================================================
-- release_report_lease — fenced delete of a failed attempt's lease
-- =====================================================
create or replace function release_report_lease(
  p_creator uuid,
  p_scan text,
  p_worker text,
  p_token uuid
) returns table (released boolean)
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
declare
  v_count integer;
begin
  if p_creator is null
     or p_scan is null or length(p_scan) = 0
     or p_worker is null or length(p_worker) = 0
     or p_token is null then
    raise exception 'release_report_lease: invalid arguments';
  end if;

  delete from report_claims
  where creator_id = p_creator
    and scan_id = p_scan
    and worker = p_worker
    and lease_token = p_token;
  get diagnostics v_count = row_count;
  return query select v_count > 0;
end;
$$;

-- ── Function privileges: revoke from everyone, grant only to service_role. ───
-- SECURITY INVOKER (the default) means RLS still applies; these REVOKE/GRANTs
-- make the functions callable only by the server's service role.
revoke all on function claim_report_lease(uuid, text, text, text, integer) from public;
revoke all on function claim_report_lease(uuid, text, text, text, integer) from anon, authenticated;
grant execute on function claim_report_lease(uuid, text, text, text, integer) to service_role;

revoke all on function renew_report_lease(uuid, text, text, uuid) from public;
revoke all on function renew_report_lease(uuid, text, text, uuid) from anon, authenticated;
grant execute on function renew_report_lease(uuid, text, text, uuid) to service_role;

revoke all on function complete_report(uuid, text, text, uuid, uuid, jsonb, text, text) from public;
revoke all on function complete_report(uuid, text, text, uuid, uuid, jsonb, text, text) from anon, authenticated;
grant execute on function complete_report(uuid, text, text, uuid, uuid, jsonb, text, text) to service_role;

revoke all on function release_report_lease(uuid, text, text, uuid) from public;
revoke all on function release_report_lease(uuid, text, text, uuid) from anon, authenticated;
grant execute on function release_report_lease(uuid, text, text, uuid) to service_role;
