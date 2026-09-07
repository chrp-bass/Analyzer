# Paid fulfillment — exact behavior

The $19 Song Intelligence report is generated and persisted **before** checkout.
After payment the buyer's read is a pure read. This document states the exact
database claim sequence, the post-payment call graph, and how legacy/incomplete
reports are recovered.

## 1. The durable, atomic claim (before any upstream work)

Two tables back preparation (migrations `0002` + `0003`):

- **`reports`** — the persisted report. A row with a **complete** payload is the
  only source of truth for "a report exists". Post-payment reads consult only
  this.
- **`report_claims`** — a short-lived **lease**. A row here means a worker is
  generating right now. It is inserted **before** Soundcharts, enrichments, or
  Anthropic run, and deleted when generation finishes or fails. `reports`
  cannot serve as this lock because `reports.analysis_id` is `NOT NULL` — a
  `reports` row cannot exist until the analysis (itself a Soundcharts call)
  has run, so a lock built on it could not precede the first upstream call.

### `prepareReport(userId, scanId)` sequence

```
1. getReport(reports)                         ── read
   └─ complete && current version? → return READY (reused). No claim, no upstream.

2. beginClaim(report_claims)                  ── the atomic claim, BEFORE upstream
   INSERT (creator_id, scan_id, worker, report_version, claimed_at)
   ├─ INSERT succeeds (PK wins)          → outcome ACQUIRED  (this worker generates)
   ├─ 23505, lease fresh (< staleAfter)  → outcome HELD      (return "preparing"; poll)
   ├─ 23505, lease stale                 → UPDATE ... WHERE claimed_at = <observed>
   │                                        (compare-and-swap; one takeover wins)
   │        ├─ rows updated → ACQUIRED
   │        └─ 0 rows       → HELD
   └─ a complete current report appeared → outcome READY (reused)

   Only ACQUIRED proceeds past this point. HELD and READY perform ZERO upstream work.

3. ensureAnalysis        ── Spotify identity + Soundcharts by-isrc → CHRP scoring
4. enrich                ── Soundcharts by-isrc (cached) + 5 fail-open enrichment endpoints
5. christianContext      ── gate from Soundcharts genre metadata only
6. generate              ── governed Dr. Rhodes (Anthropic), one retry, fail-closed
7. completeClaim         ── UPSERT reports(payload, analysis_id, ...); DELETE our lease
   any failure at 3–7    ── releaseClaim (DELETE our lease); nothing persisted; no charge
```

**Cross-instance guarantee.** Of N requests for one scan on N separate Vercel
instances, the `report_claims` primary-key INSERT admits exactly one `ACQUIRED`.
Every other request is `HELD` and returns `preparing` having touched no upstream
service; the client polls `GET /api/scan/prepare` (readiness only) until the
`reports` row is complete. The per-instance in-memory promise map is a
same-instance fast path only — never the lock. Proven in
`tests/paid-fulfillment-prepare.test.ts` ("separate Vercel instances", "the claim
is acquired before any upstream work", "a request that loses the claim does ZERO
upstream work").

**Checkout gate.** `POST /api/checkout` calls `verifyCheckoutReadiness`, which
refuses unless a **complete** `reports` row exists for this identity and scan,
produced from the analysis currently on file, under the current report and engine
versions, matching the `reportId`/`reportVersion` the client says it prepared.
Stripe is never contacted otherwise. The charge is bound to that report in the
Stripe session metadata.

## 2. Post-payment call graph (verify → read → render)

The paid read is exactly:

```
GET /api/report/[id]           (also /pdf, and POST /api/rhodes/session)
  └─ resolveEntitledReport(scanId)          [src/lib/reports/resolve.server.ts]
       ├─ assertReportAccess  → credit-service + Supabase        (entitlement)
       ├─ freeReportForScan   → analysis-mapping + Supabase       (free half)
       └─ ReportStore.getReport → reports table (Supabase)        (paid half)
            └─ isCompletePaidPayload ? render : 503 "being prepared"
```

`resolve.server.ts` and `free-report.server.ts` import **no** upstream client —
not `@/lib/engine/soundcharts`, not `@/lib/engine/analyze.server`, not
`@/lib/engine/spotify`, not `@/lib/reports/generate.server`, not
`@/lib/reports/prepare*`, not `@/lib/rhodes`, and they reach `api.anthropic.com`
through nothing. This is asserted structurally in `tests/paid-report-resolve.test.ts`
("imports no upstream client, and no preparer") and behaviourally (the store call
trace on a paid read is exactly `["getReport"]`). **No live Soundcharts, no
enrichment, no Anthropic generation, no manual refresh** ever runs on a read.

## 3. Legacy / incomplete entitled reports

A read **never** regenerates. An entitled caller whose persisted payload is
missing or incomplete receives an honest `503` (`entitled: true`, "your report is
being prepared; your purchase is safe and access is retained"). The buyer's first
paid read performs no upstream work in any case.

Recovery is offline and operator-run, pre-deployment:

1. **Inventory** (read-only, no upstream):
   ```
   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
     npx tsx scripts/inventory-incomplete-reports.mts
   ```
   Classifies every entitled scan (song + creator tiers) as `ok`,
   `stale_version`, `missing`, or `incomplete`. Only `missing`/`incomplete`
   force a backfill; a complete report on an older version still serves.

2. **Backfill** (the same idempotent preparer, out of band):
   ```
   NODE_OPTIONS='--conditions=react-server' \
     <all app env vars> npx tsx scripts/backfill-reports.mts        # all incomplete
     … npx tsx scripts/backfill-reports.mts <creatorId> <scanId>    # one scan
     … npx tsx scripts/backfill-reports.mts --dry-run               # list only
   ```
   Regenerates through `prepareReportForScan`, so the durable claim still holds:
   a buyer arriving mid-backfill causes only one generation, and a re-run of the
   backfill reuses whatever completed.

**Migration safety.** Complete reports — current or legacy-contract — are never
touched or invalidated; they keep serving unchanged (a legacy payload simply
omits the movements added later). Only a `missing`/`incomplete` payload is
regenerated, and only by the offline backfill.

## `[report-timing]` stages

`analysis`, `enrichments`, `christian_context`, `rhodes_generation`,
`report_persistence` (preparation) and `entitlement_check`,
`persisted_report_retrieval` (read). One line per stage:
`[report-timing] stage=<stage> scan=<scanId> ms=<n> outcome=ok|error`.
