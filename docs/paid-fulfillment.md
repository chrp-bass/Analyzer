# Paid fulfillment — exact behavior

The $19 Song Intelligence report is generated and persisted **before** checkout.
After payment the buyer's read is a pure read. This document states the exact
fenced-lease design, the atomic completion transaction, the post-payment call
graph, RLS, legacy recovery, and deployment/rollback order.

## 1. The durable, fenced lease (before any upstream work)

Two tables back preparation (migrations `0002` + `0003`):

- **`reports`** — the persisted report. A row with a **complete** payload is the
  only source of truth for "a report exists". Post-payment reads consult only
  this.
- **`report_claims`** — a short-lived **lease**. A row means a worker is
  generating right now. Inserted **before** Soundcharts / enrichments / Anthropic
  and removed when generation finishes or fails. `reports` cannot be the lock:
  `reports.analysis_id` is `NOT NULL`, so a `reports` row cannot exist until the
  analysis (itself a Soundcharts call) has run.

### Fencing — token + fence, never `claimed_at` alone

Every acquisition and every takeover mints a fresh immutable **`lease_token`**
(uuid) and bumps a monotonically increasing **`fence`** (bigint). `renew`,
`complete` and `release` are all gated on
`(creator_id, scan_id, worker, lease_token)`. A worker that lost the lease to a
takeover matches nothing, so it can neither renew, overwrite the report,
complete preparation, nor delete the successor's lease.

### DB time, not app time

Freshness and renewal use `now()` **inside Postgres**. `claim_report_lease`
decides staleness with `claimed_at < now() - interval`; `renew_report_lease`
sets `claimed_at = now()`. An application instance's clock is never trusted for
lease timing.

### The four database functions (all `SECURITY INVOKER`, client-revoked)

| Function | Role |
|---|---|
| `claim_report_lease(creator, scan, worker, version, stale_seconds)` | Atomic acquire-or-takeover. `INSERT … ON CONFLICT DO UPDATE … WHERE claimed_at < now() - interval` mints a new token and `fence+1` on a stale lease; a fresh conflicting lease makes the `WHERE` false → 0 rows → HELD. A complete current-version report short-circuits to "ready", **and after acquiring it re-checks** for a report a completer committed while it was blocked (see race 2 below). |
| `renew_report_lease(creator, scan, worker, token)` | Heartbeat. `UPDATE … SET claimed_at = now() WHERE worker & lease_token match`; 0 rows ⇒ lease lost. |
| `complete_report(creator, scan, worker, token, analysis, payload, version, model)` | **One transaction:** ownership+version validated under `SELECT … FOR UPDATE` (see race 1 below) → `UPSERT reports` → `DELETE` this lease. Ownership lost ⇒ returns `ok=false`, writes nothing. No unfenced upsert-then-delete. |
| `release_report_lease(creator, scan, worker, token)` | Fenced delete of the caller's own failed-attempt lease. |

### Two transaction races, and how they are closed

**Race 1 — takeover between ownership check and write.** An earlier draft
validated ownership with an unlocked `IF EXISTS`, so a takeover could interpose
between the check and the `UPSERT`, letting a superseded worker overwrite the
successor's report. `complete_report` now takes a row lock —
`SELECT … FOR UPDATE` on the matching `(worker, lease_token, version)` lease —
and holds it through the write. A concurrent `claim_report_lease` takeover of
the same row blocks until completion commits; if a takeover already won, the row
no longer matches and `FOUND` is false, so nothing is written.

**Race 2 — completion committing after a claimant's pre-check.** The pre-check
runs on an earlier snapshot, so a claimant blocked behind an in-flight
completion could acquire a fresh lease just as the report was committed.
`claim_report_lease` therefore **re-checks after acquiring**: if a complete
current-version report now exists (a fresh snapshot under READ COMMITTED sees the
committed row), it releases the just-acquired lease and returns READY — the
claimant does no upstream work.

Both are proven against **real PostgreSQL** (two concurrent connections, actual
`FOR UPDATE` blocking) in `tests/report-claims-pg.test.ts`, which loads the
shipped function bodies and reproduces: claimant blocked behind completion,
takeover racing completion, completion after ownership check, and report
committed while the claimant waits. (The suite self-skips if Postgres cannot be
started; the SQL-text assertions in `paid-fulfillment-prepare.test.ts` still run
everywhere.)

### `prepareReport(userId, scanId)` sequence

```
1. getReport(reports)  → complete & current version? return READY (reused). No claim, no upstream.
2. beginClaim → claim_report_lease:
     ACQUIRED (token, fence) → this worker generates
     HELD                    → return "preparing"; poll; ZERO upstream work
     READY                   → a complete report already exists
3. start heartbeat  → renew_report_lease every ~25s on DB time; on "lost" set a flag
4. ensureAnalysis   (Spotify + Soundcharts → scoring)     ┐
5. enrich           (Soundcharts enrichment endpoints)    │ only ACQUIRED reaches here
6. christianContext (gate)                                │
7. generate         (Anthropic / Rhodes)                  ┘
   lost the lease during 4–7? → stop, persist nothing (failed: lease_lost)
8. completeClaim → complete_report  (atomic UPSERT reports + DELETE lease, fenced)
     ok=false (lost) → persist nothing (failed: lease_lost)
   any failure at 4–7 → releaseClaim (fenced); nothing persisted; no charge
   heartbeat stopped in finally
```

Lease TTL is 90s (`DEFAULT_STALE_AFTER_MS`); heartbeat every 25s
(`DEFAULT_HEARTBEAT_MS`), so a generation longer than the TTL keeps its lease and
is never taken over mid-flight, while a genuinely stalled worker is superseded
after 90s.

**Cross-instance guarantee.** Of N requests on N instances, exactly one
`ACQUIRED`; the rest `HELD` → `preparing`, touching no upstream service. Proven in
`tests/paid-fulfillment-prepare.test.ts`.

## 2. Post-payment call graph (verify → read → render)

```
GET /api/report/[id]  (also /pdf, and POST /api/rhodes/session)
  └─ resolveEntitledReport(scanId)          [src/lib/reports/resolve.server.ts]
       ├─ assertReportAccess  → credit-service + Supabase        (entitlement)
       ├─ freeReportForScan   → analysis-mapping + Supabase       (free half)
       └─ ReportStore.getReport → reports table (Supabase)        (paid half)
            └─ isCompletePaidPayload ? render : 503 "being prepared"
```

`resolve.server.ts` and `free-report.server.ts` import **no** upstream client;
verified transitively (14 runtime modules reachable from `resolve.server.ts`,
zero upstream) and behaviourally (store trace on a read is exactly `["getReport"]`).
No live Soundcharts, enrichment, or Anthropic runs on a read.

### `POST /api/rhodes/session`

Voice **may**, after resolving the persisted report, call the ElevenLabs
signed-URL module (`rhodes-voice/signed-url`) to mint a short-lived token. It must
**never** reach Rhodes text generation (`@/lib/rhodes` / the Anthropic call) or
report preparation (`@/lib/reports/prepare*`, the generator). Enforced by the
transitive graph test `tests/rhodes-session-callgraph.test.ts`: the graph
contains the signed-URL module and none of `lib/rhodes/`, `reports/generate`,
`reports/prepare*`, `analysis-facts.server`, or the engine clients.

## 3. RLS and privileges — service role only

`report_claims` has `ROW LEVEL SECURITY` enabled with **no policies**, so under
RLS the `anon` and `authenticated` roles can neither select, insert, update nor
delete; `revoke all on table report_claims from anon, authenticated` is stated
explicitly as well. The four functions are `SECURITY INVOKER` (RLS still applies)
and `REVOKE … FROM public, anon, authenticated`, so only the service role can
call them. `reports` likewise has RLS with no client policies (0002). Pinned in
`tests/paid-fulfillment-prepare.test.ts` ("locks the table to the service role").

## 4. Legacy / incomplete entitled reports

A read **never** regenerates. An entitled caller whose persisted payload is
missing or incomplete receives an honest `503` (`entitled: true`, "your report is
being prepared…"). Recovery is offline, operator-run, pre-deployment:

```
# read-only census
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  npx tsx scripts/inventory-incomplete-reports.mts

# regenerate missing/incomplete out of band (same fenced preparer)
NODE_OPTIONS='--conditions=react-server' <all app env vars> \
  npx tsx scripts/backfill-reports.mts            # all incomplete
  … scripts/backfill-reports.mts <creatorId> <scanId>   # one scan
  … scripts/backfill-reports.mts --dry-run              # list only
```

Complete reports — current or legacy-contract — are never touched.

## 5. Deployment order and rollback

The migration is **additive** (one new table, four new functions; no change to
existing tables, columns, indexes, policies), and the fenced lease reads/writes go
exclusively through the new functions. Deploy in this order:

1. **Apply `0003_report_claims.sql`** to production Postgres (Supabase SQL editor
   or psql).
2. **Verify** the table and functions exist and are locked down:
   ```sql
   select to_regclass('public.report_claims');                       -- not null
   select proname from pg_proc
     where proname in ('claim_report_lease','renew_report_lease',
                       'complete_report','release_report_lease');     -- 4 rows
   -- report_claims has RLS on and no policies:
   select relrowsecurity from pg_class where relname='report_claims'; -- t
   select count(*) from pg_policies where tablename='report_claims';  -- 0
   -- each RPC pins a fixed search_path and is executable only by service_role:
   select proname, proconfig from pg_proc
     where proname in ('claim_report_lease','renew_report_lease',
                       'complete_report','release_report_lease');
     -- proconfig each: {search_path=pg_catalog, public, extensions}
   select has_function_privilege('service_role','complete_report(uuid,text,text,uuid,uuid,jsonb,text,text)','execute'); -- t
   select has_function_privilege('anon','complete_report(uuid,text,text,uuid,uuid,jsonb,text,text)','execute');         -- f
   ```
3. **(Optional) backfill** any pre-existing incomplete entitled reports
   (§4) before shipping the app, so no buyer meets a 503.
4. **Deploy the application.** Only the new build calls the new functions.

### Rollback behavior

- **Roll the APP back, keep the migration:** safe. `report_claims` and its
  functions are additive — the previous app build simply never references them.
  The old build persisted the report on the post-payment read; the new tables sit
  unused. (If you roll back to a build that generates on read, that build's own
  behavior returns; the `reports` rows written by the new build remain valid and
  are served as before.) No data written by the new build is invalidated: a
  `reports` row is a complete report regardless of which build wrote it, and a
  leftover `report_claims` lease is ignored by an app that doesn't read the table
  and ages out harmlessly.
- **Roll the migration back too (drop the table/functions):** only after the app
  is on a build that does not call them. Because a lease is a lease, not report
  data, dropping `report_claims` loses nothing durable; any in-flight preparation
  at that moment simply fails closed (no charge) and is retried.
- **Never** drop the migration while the new app build is live — the functions
  are load-bearing for preparation, and their absence fails checkout closed
  (nobody is charged), but it is an outage of the paid path.

## `[report-timing]` stages

`analysis`, `enrichments`, `christian_context`, `rhodes_generation`,
`report_persistence` (preparation) and `entitlement_check`,
`persisted_report_retrieval` (read):
`[report-timing] stage=<stage> scan=<scanId> ms=<n> outcome=ok|error`.
