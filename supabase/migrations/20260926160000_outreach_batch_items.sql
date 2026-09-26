-- =====================================================
-- Outreach batch items — founder outreach, internal only
-- =====================================================
-- One row per song per admin batch run (POST /api/admin/batch-scan). It
-- records how the requested song resolved, the scores the EXISTING engine
-- produced, and the one verbatim sentence lifted from the persisted Rhodes
-- report that the DM will quote. Nothing here is read by any public surface.
--
-- Additive only. The analysis itself lives in `analyses` and the report in
-- `reports`, both owned by the outreach service identity; this table points
-- at them (analysis_id) rather than copying the report.
--
-- SECURITY. Service-role only: RLS on with no policies, every default grant
-- revoked from anon/authenticated. The route reaches it with the admin client.
-- =====================================================

create table if not exists outreach_batch_items (
  id                 uuid        primary key default gen_random_uuid(),
  batch_id           text        not null,
  scan_id            text,
  analysis_id        uuid        references analyses(id) on delete set null,
  requested_artist   text        not null,
  requested_title    text        not null,
  resolved_artist    text,
  resolved_title     text,
  isrc               text,
  instagram          text,
  status             text        not null check (status in (
                       'scored', 'not_found', 'identity_mismatch', 'deferred',
                       'no_quotable_finding', 'error')),
  -- Short machine reason for error/deferred rows (never shown to a creator).
  reason             text,
  mode               text,
  epi_score          integer,
  flow_score         integer,
  ready_score        integer,
  recharge_score     integer,
  recover_score      integer,
  -- The verbatim sentence, and the JSON path in reports.payload it came from.
  finding            text,
  finding_source     text,
  finding_candidates jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists outreach_batch_items_batch_idx
  on outreach_batch_items (batch_id, created_at);
create index if not exists outreach_batch_items_isrc_idx
  on outreach_batch_items (isrc);

alter table outreach_batch_items enable row level security;
revoke all on table outreach_batch_items from public;
revoke all on table outreach_batch_items from anon, authenticated;
grant select, insert, update, delete on table outreach_batch_items to service_role;
