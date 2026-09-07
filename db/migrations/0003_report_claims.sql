-- =====================================================
-- CHRP Song Intelligence (Analyzer) — report preparation claims (V3)
-- =====================================================
-- Apply AFTER 0002_song_memory.sql. Additive only: one new table, no change
-- to any existing table, column, index or policy.
--
-- WHY THIS TABLE EXISTS (and why the reports table could not do the job):
--
-- Paid fulfillment must acquire a durable, database-level, atomic claim
-- BEFORE any upstream work runs — before Soundcharts, before the enrichment
-- endpoints, before Anthropic — so that when N requests for the same scan
-- arrive on N separate Vercel instances, exactly ONE performs generation and
-- the rest poll for readiness having done zero upstream work.
--
-- The `reports` table cannot be that lock. `reports.analysis_id` is NOT NULL
-- and references `analyses(id)`, so a `reports` row cannot be inserted until
-- the analysis already exists — and producing the analysis is itself a
-- Soundcharts call. A lock that can only be taken after the first upstream
-- call is not a lock on upstream work. Hence a dedicated claim row keyed only
-- on (creator_id, scan_id), inserted first, holding nothing but the identity
-- of the worker and when it started.
--
-- The claim is a LEASE, not a permanent record: it is deleted when the report
-- is persisted (success) or when preparation fails (so a retry can re-acquire
-- cleanly), and a claim older than the lease window may be taken over by a
-- new worker via a compare-and-swap on `claimed_at`. The persisted `reports`
-- row — never this table — is the source of truth for whether a report
-- exists. This table only answers "is someone generating right now?".
-- =====================================================

create table if not exists report_claims (
  creator_id     uuid        not null references creators(id) on delete cascade,
  scan_id        text        not null,
  -- The instance/attempt that currently holds the lease. Compare-and-swap on
  -- (claimed_at) is how a stale lease is taken over atomically: only the
  -- worker whose observed timestamp still matches wins the UPDATE.
  worker         text        not null,
  -- The report/methodology version this preparation will produce. Recorded so
  -- a claim left by an older deploy is legible.
  report_version text        not null,
  claimed_at     timestamptz not null default now(),
  -- The atomic claim IS this primary key: the first INSERT for a
  -- (creator_id, scan_id) wins; every concurrent INSERT loses on the unique
  -- violation and becomes a poller.
  primary key (creator_id, scan_id)
);

create index if not exists report_claims_claimed_at_idx
  on report_claims (claimed_at);

alter table report_claims enable row level security;
-- No policies. Service role only, reached exclusively from server preparation
-- code. The browser can neither read nor write a claim.
