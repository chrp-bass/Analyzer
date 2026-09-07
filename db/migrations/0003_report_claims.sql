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
-- the analysis (itself a Soundcharts call) already exists. A lock that can
-- only be taken after the first upstream call is not a lock on upstream work.
--
-- FENCING. A lease is not identified by time. Each acquisition and each
-- takeover mints a fresh immutable `lease_token` (uuid) and bumps a
-- monotonically increasing `fence`. Every mutation — renew, complete,
-- release — is gated on `(creator_id, scan_id, worker, lease_token)`, so a
-- worker that lost the lease to a takeover can neither renew it, overwrite the
-- report, mark preparation complete, nor delete the successor's lease. A
-- stale-worker's late completion is a no-op.
--
-- DB TIME. Freshness and renewal use `now()` inside the database, never an
-- application instance's clock. `claim_report_lease` decides staleness with
-- `claimed_at < now() - interval`; `renew_report_lease` sets
-- `claimed_at = now()`.
--
-- ATOMIC COMPLETION. `complete_report` writes the report and deletes the lease
-- in ONE function body — one transaction — and only if the caller still owns
-- the lease. There is no unfenced UPSERT-then-DELETE.
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
  -- Monotonically increasing across takeovers of one lease lineage. A second,
  -- independent fencing signal alongside the token.
  fence          bigint      not null default 1,
  report_version text        not null,
  claimed_at     timestamptz not null default now(),
  primary key (creator_id, scan_id)
);

create index if not exists report_claims_claimed_at_idx
  on report_claims (claimed_at);

-- ── RLS: deny all client access. Service role bypasses RLS. ─────────────────
-- No policies are created, so under RLS the anon and authenticated roles can
-- neither select, insert, update nor delete. The browser can never read or
-- write a claim; only server code holding the service-role key can.
alter table report_claims enable row level security;
revoke all on table report_claims from anon, authenticated;

-- =====================================================
-- claim_report_lease — atomic acquire-or-takeover, BEFORE any upstream work
-- =====================================================
-- Returns:
--   one row (acquired = true)  → this caller holds the lease; use lease_token/fence.
--   one row (acquired = false) → a complete current-version report already exists.
--   zero rows                  → a FRESH lease is held by someone else; poll.
--
-- The INSERT ... ON CONFLICT DO UPDATE ... WHERE is the atomic claim: a fresh
-- conflicting lease makes the WHERE false, so no row is updated or returned
-- (zero rows → held); a stale one is taken over with a NEW token and fence+1.
-- Two concurrent takeovers serialise on the row lock: the first refreshes
-- claimed_at, the second re-evaluates the WHERE against the fresh row and is
-- rejected.
create or replace function claim_report_lease(
  p_creator uuid,
  p_scan text,
  p_worker text,
  p_version text,
  p_stale_seconds integer
) returns table (acquired boolean, out_token uuid, out_fence bigint, out_claimed_at timestamptz)
language plpgsql
as $$
begin
  -- A complete report on the current version already exists → nobody claims.
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

  return query
  insert into report_claims as rc (creator_id, scan_id, worker, lease_token, fence, report_version, claimed_at)
  values (p_creator, p_scan, p_worker, gen_random_uuid(), 1, p_version, now())
  on conflict (creator_id, scan_id) do update
    set worker = excluded.worker,
        lease_token = gen_random_uuid(),
        fence = rc.fence + 1,
        report_version = excluded.report_version,
        claimed_at = now()
    where rc.claimed_at < now() - make_interval(secs => p_stale_seconds)
  returning true, rc.lease_token, rc.fence, rc.claimed_at;
end;
$$;

-- =====================================================
-- renew_report_lease — heartbeat, using DB time, fenced on the token
-- =====================================================
-- Returns the fence when the caller still owns the lease; zero rows when it
-- has lost it (a takeover re-minted the token). `claimed_at = now()` is DB
-- time, never the caller's clock.
create or replace function renew_report_lease(
  p_creator uuid,
  p_scan text,
  p_worker text,
  p_token uuid
) returns table (out_fence bigint)
language plpgsql
as $$
begin
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
-- complete_report — atomic: persist report + release lease, fenced
-- =====================================================
-- One transaction. Only the current lease owner may complete. On success the
-- report is upserted and the lease deleted together; if ownership was lost the
-- function returns ok = false and writes NOTHING.
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
as $$
declare
  v_id uuid;
begin
  -- Fenced ownership check. A superseded worker matches nothing here.
  if not exists (
    select 1 from report_claims
    where creator_id = p_creator
      and scan_id = p_scan
      and worker = p_worker
      and lease_token = p_token
  ) then
    return query select false, null::uuid;
    return;
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
-- Deletes ONLY the caller's own lease. A worker that lost ownership deletes
-- nothing, so it can never remove the successor's lease.
create or replace function release_report_lease(
  p_creator uuid,
  p_scan text,
  p_worker text,
  p_token uuid
) returns table (released boolean)
language plpgsql
as $$
declare
  v_count integer;
begin
  delete from report_claims
  where creator_id = p_creator
    and scan_id = p_scan
    and worker = p_worker
    and lease_token = p_token;
  get diagnostics v_count = row_count;
  return query select v_count > 0;
end;
$$;

-- ── Function privileges: server/service role only. ──────────────────────────
-- These functions are SECURITY INVOKER (the default), so they run with the
-- caller's privileges and RLS still applies. Executing them from the browser
-- roles is additionally revoked, so only the service role (and postgres) can
-- call them at all.
revoke all on function claim_report_lease(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function renew_report_lease(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function complete_report(uuid, text, text, uuid, uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function release_report_lease(uuid, text, text, uuid) from public, anon, authenticated;
