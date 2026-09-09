# CHRP Analyzer Production Sentinel

`npm run health:production` is the one deterministic, **read-only** production
health command. It emits a concise human summary and versioned JSON
(`schemaVersion: 1`) with an overall `GREEN`, `YELLOW` or `RED`, per-boundary
and per-check results, sanitised evidence, timings, and the production commit
SHA / Vercel deployment id that answered.

It never writes, generates or regenerates a report, creates a Stripe object,
grants an entitlement, opens a voice conversation, or repairs anything.

## 1. Architecture

```
GitHub Actions (production-sentinel.yml)          Vercel  (scan.chrp.ai)
  after every Production deployment,               ┌──────────────────────────────────────┐
  nightly, on demand                               │ GET /api/health/production           │
  holds ONE secret: HEALTH_MONITOR_SECRET          │   Authorization: Bearer <monitor>    │
        │                                          │   403 wrong/missing · 503 unconfigured│
        ▼                                          │                                      │
  npm run health:production                        │ run.server.ts (45s budget, parallel) │
   ├─ boundary 1  application  ── public probes ──▶│                                      │
   │    DNS/TLS, 7 public routes, 11 invalid /     │  supabase  PostgREST, service + anon │
   │    unauthorized API probes, anonymous catalog │  stripe    prices.retrieve,          │
   ├─ GET /api/health/production ─────────────────▶│            webhookEndpoints.list,    │
   │    boundaries 2–5 run where the vendor        │            stripe_events ledger      │
   │    secrets already live; nothing copied       │  pipeline  presence-only config,     │
   ├─ deployment_identity: alias serves the        │            analyses/reports counts   │
   │    expected SHA (settles ≤ 6 × 15s)           │  rhodes    agent read, drift, one    │
   └─ merge → sanitise → GREEN/YELLOW/RED          │            signed-URL mint (dropped) │
        │                                          └──────────────────────────────────────┘
        ├─ $GITHUB_STEP_SUMMARY (Markdown)
        └─ artifact production-sentinel-<run>.json
```

Code lives in `src/lib/sentinel/`:

| module | role |
| --- | --- |
| `types.ts` | the versioned result schema (`PASS` / `WARN` / `FAIL` / `NOT_EXERCISED`; `GREEN` / `YELLOW` / `RED`) |
| `evaluate.ts` | rollup, `runCheck` (per-check deadline; a thrown error or timeout is a sanitised FAIL) |
| `redact.ts` | `sanitizeText` / `sanitizeDeep` — every string the sentinel emits passes through both |
| `thresholds.ts` | every number the sentinel judges against (below) |
| `http.ts`, `postgrest.ts` | injectable fetch wrapper; the read-only PostgREST reader (service + anon roles) |
| `checks/application.ts` | boundary 1 (runs in the CLI) |
| `checks/supabase.ts`, `checks/stripe.ts`, `checks/pipeline.ts`, `checks/rhodes.ts` | boundaries 2–5 (run on Vercel) |
| `client.ts`, `format.ts` | the CLI orchestrator and the human / Markdown renderings |
| `auth.ts`, `run.server.ts`, `src/app/api/health/production/route.ts` | the protected Vercel surface |
| `scripts/health-production.mts` | the command |

Every check takes injected dependencies (fetch, reader, Stripe reader, minter,
clock), so the unit tests exercise timeouts, provider failures, malformed
bodies, secret redaction and idle/partial telemetry without a network.

## 2. Status vocabulary and rollup

* `PASS` — the invariant held. `WARN` — degraded or drifting; the product
  works. `FAIL` — the invariant is broken.
* `NOT_EXERCISED` — the dependency cannot be tested without cost or mutation,
  or no evidence surface exists. It is never reported as PASS and never
  changes the colour on its own.
* Overall: any `FAIL` → `RED`; else any `WARN` → `YELLOW`; else `GREEN`.
* Exit code: `RED` → 1; `YELLOW` → 0 (1 with `--strict`); `GREEN` → 0;
  the sentinel itself failing to run → 2.

## 3. Exact checks and thresholds

Thresholds are constants in `src/lib/sentinel/thresholds.ts`; the tests pin
them to the code they describe (e.g. `staleClaimMs` = the lease TTL).

### Boundary 1 — application (from outside)

| check | what | PASS / WARN / FAIL |
| --- | --- | --- |
| `dns_tls_root` | `GET /` | 200 HTML through Vercel (`x-vercel-id`); no edge header → WARN; latency > 3000 ms WARN, > 8000 ms FAIL |
| `public_routes` | `/`, `/scan`, `/methodology`, `/contact`, `/signin` (200 HTML); `/privacy`, `/terms` (must 307/308 to exactly `https://chrp.ai/privacy` / `https://chrp.ai/terms`) | wrong status, non-HTML or a redirect elsewhere → FAIL; slow > 3 s WARN; > 8 s FAIL |
| `api_guards` | 11 controlled invalid / unauthorized probes | each must answer its own 4xx: `GET /api/report/scn_probe` 403 `forbidden`; `POST /api/rhodes/session {}` 400 `invalid_body`; `POST /api/rhodes/session/outcome {}` 400; `POST /api/stripe/webhook` unsigned 400 `missing signature`; `POST /api/checkout {}` 400 `unknown offer`; `GET`/`POST /api/scan/prepare` malformed scan 400 `invalid scanId`; `GET /api/song-api/search` 400; `POST /api/scan-report` **404** `not_found` (the fixture bridge must be unreachable in production); `GET /api/health/production` and `GET /api/health/rhodes-agent` without a token 403. Any 404 where a 4xx guard is expected, or any 5xx → FAIL |
| `anonymous_catalog` | `GET /api/catalog` | 200 with `identified:false` and an empty catalog |
| `deployment_identity` | server-reported `VERCEL_GIT_COMMIT_SHA` vs `--expect-sha` | mismatch after ≤ 6 attempts × 15 s → FAIL; no expected SHA: production env PASS, preview FAIL, unknown SHA WARN |
| `vercel_error_rate` | Vercel 5xx rate / latency history | `NOT_EXERCISED` — needs a Vercel API token, which the sentinel deliberately keeps out of GitHub; its own probe latencies are the available evidence |

### Boundary 2 — Supabase (service role + anon role, aggregates only)

| check | what | thresholds |
| --- | --- | --- |
| `connectivity_and_schema` | `GET /rest/v1/` OpenAPI as the service role | all of `creators, songs, analyses, reports, report_claims, entitlements, entitlement_tracks, stripe_events` exposed |
| `lease_rpcs_exist` | null-argument POST to each of `claim_report_lease`, `renew_report_lease`, `complete_report`, `release_report_lease` | present functions raise `invalid arguments` (400/P0001) before any statement that could write; 404/PGRST202 → FAIL |
| `rls_client_isolation` | as **anon**: `SELECT … LIMIT 1` on `report_claims` (expect 401/403), `reports`, `entitlements`, `stripe_events` (expect 200 and zero rows); null-argument POST to the 4 RPCs (expect 401/403) | any row visible or any RPC executable → FAIL; `report_claims` readable-but-empty → WARN (grants not revoked) |
| `report_claims_stale` | `count(*)` of claims with `claimed_at` older than the lease TTL / the abandoned cut-off (DB time) | > 90 s → WARN; > 15 min → FAIL |
| `duplicate_anomalies` | in-process over ≤ 5 000 rows each: duplicate `(user, scan)` song entitlements, duplicate checkout sessions, song entitlements without a scan, duplicate `(creator, scan)` reports, duplicate report `analysis_id`, creator entitlements with more tracks attached than `track_limit` | any → FAIL; over the cap → `sampled: true` |

No identity, report content or internal id ever leaves the process; the tests
assert the JSON contains no UUID, e-mail, scan id or session id.

### Boundary 3 — Stripe (read-only)

| check | what | thresholds |
| --- | --- | --- |
| `configuration` | presence of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`whsec_`), both price ids | missing/malformed → FAIL; test-mode key → WARN |
| `credentials_and_prices` | `prices.retrieve` for both configured ids (the same harmless read checkout performs) | authentication / permission failure → FAIL; inactive, amount ≠ $19.00 / $149.00, currency ≠ usd, recurring → FAIL; test-mode objects → WARN |
| `webhook_endpoint` | `webhookEndpoints.list` | an **enabled** endpoint at `<NEXT_PUBLIC_SITE_URL>/api/stripe/webhook` receiving `checkout.session.completed` → PASS; missing `charge.refunded` / `charge.dispute.created` → WARN; none → FAIL; key lacks permission → `NOT_EXERCISED` |
| `fulfillment_recent` | `stripe_events` and `entitlements` counts over 24 h | any event unprocessed for > 10 min → FAIL (a webhook died mid-grant); completed checkouts > paid entitlements → WARN; idle → PASS |

### Boundary 4 — intelligence pipeline (never generates)

| check | what | thresholds |
| --- | --- | --- |
| `configuration` | presence of `ANTHROPIC_API_KEY`, `SOUNDCHARTS_APP_ID`, `SOUNDCHARTS_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | missing → FAIL |
| `fixture_escape_hatch_unset` | `CHRP_ALLOW_FIXTURE_REPORTS` | set → FAIL (fixture prose would be sold as intelligence) |
| `analyses_recent` | `analyses` by status, 24 h | pending > 60 min → WARN; failed ratio > 25 % over ≥ 4 runs → WARN; idle → PASS |
| `reports_recent` | `reports` persisted in 24 h, on the current generator, and all-time rows with a null governed section | incomplete > 0 → WARN (entitled reads answer 503 until the offline backfill); superseded generator version → WARN |
| `preparation_latency` | analysis row → report row wall clock, 24 h, ≤ 500 samples | p95 > 120 s → WARN; idle → PASS |
| `stage_latency` | per-stage `[report-timing]` | `NOT_EXERCISED` — log lines only, no queryable surface |
| `generation`, `upstream_engines` | Anthropic / Soundcharts / Spotify calls | `NOT_EXERCISED` — cost, quota and mutation |

### Boundary 5 — Dr. Rhodes / ElevenLabs

| check | what | thresholds |
| --- | --- | --- |
| `configuration` | `ELEVENLABS_API_KEY`, `ELEVENLABS_RHODES_AGENT_ID` via the voice config validator | defect → FAIL (code + variable only); agent id ≠ `vv1j1yrAGF0RdxJOSGIJ` → WARN |
| `agent_exists` | `GET /v1/convai/agents/{id}` | non-200 → FAIL with the classified category (`invalid_api_key`, `missing_permissions`, `agent_not_found`, …) |
| `agent_enabled` | `GET /v1/convai/agents` (≤ 3 pages) `archived` flag | archived → FAIL; not listed / not permitted → `NOT_EXERCISED` |
| `agent_published_main` | `GET /v1/convai/agents/{id}/branches` | Main committed and serving traffic → PASS; unpublished draft → WARN; no live version → FAIL; versioning not enabled → `NOT_EXERCISED` |
| `system_prompt_drift` | live prompt vs `RHODES_VOICE_SYSTEM_PROMPT` (whitespace-normalised) and the governed clauses in `RHODES_VOICE_GOVERNED_CLAUSES` | exact → PASS; wording differs, all clauses present → WARN; a *behavioural* clause missing (conversational lead, reflective question, no generic follow-ups, no fame/fortune/virality/placement promises, …) → WARN naming it; a *structural* clause missing (`{{report_context}}`, data fence, "you have the report", identity/EPI variables) → FAIL. Evidence is 12-hex fingerprints and lengths, never the text |
| `first_message_drift` | live first message vs `RHODES_VOICE_FIRST_MESSAGE` | same policy; losing `{{song_title}}`/`{{first_signal}}` → FAIL |
| `dynamic_variables` | placeholders referenced by the live prompt + first message | every one of `song_title, song_artist, epi_score, epi_mode, first_signal, report_context` referenced → PASS; a placeholder the server never sends → FAIL (ElevenLabs would refuse every session); a governed variable unreferenced → FAIL |
| `signed_url_mint` | exactly one `get-signed-url` through the production client | the URL is discarded in-process; only attempts and ms are kept; failure → FAIL with the category |

## 4. Security model

* **One secret in GitHub.** `HEALTH_MONITOR_SECRET` (≥ 32 random chars) is the
  only Actions secret; the workflow is tested to reference no other secret.
  Vendor credentials never leave Vercel.
* **The surface is opaque without it.** `/api/health/production` answers the
  same 403 to a missing or wrong token (constant-time comparison), and 503 when
  the secret is not configured. It is `GET`-only, `no-store`, `maxDuration 60`.
* **Read-only by construction.** PostgREST GET/HEAD plus null-argument RPC
  probes that the functions reject before any write; Stripe `prices.retrieve`
  and `webhookEndpoints.list`; ElevenLabs GETs plus one signed-URL mint that is
  dropped. The route's runtime import graph is tested never to reach report
  generation, preparation, the engines, the entitlement writer or the mailer.
* **Aggregates only.** Rows fetched for duplicate detection stay in memory;
  results carry counts. `sanitizeDeep` runs on the server report and again on
  the merged report, scrubbing Stripe keys/ids, `whsec_`, `xi-api-key`, JWTs,
  `wss://`/`https://` URLs, e-mails, UUIDs, scan ids and long tokens; the
  commit SHA, deployment id and fingerprints survive only under their own keys
  and only when they look like identifiers.
* **Fail-closed reporting.** A missing monitor secret, a rejected token, a
  missing route or a malformed server document makes all four vendor
  boundaries `FAIL` — the sentinel is never accidentally GREEN.
* **No side channels.** No browser automation, no auto-repair, no issue
  creation, no messages. The sentinel does not emit `[rhodes-voice]` log lines.

## 5. Running it

```bash
# locally (needs only the monitor secret)
HEALTH_MONITOR_SECRET=… npm run health:production
HEALTH_MONITOR_SECRET=… npm run health:production -- --json --expect-sha <sha>
npm run health:production -- --json-out out.json --summary summary.md --strict
```

Automation (`.github/workflows/production-sentinel.yml`): triggered by Vercel's
`deployment_status` (state `success`, environment `Production`, passing the
deployed SHA as `--expect-sha`), nightly at 06:17 UTC, and `workflow_dispatch`
(optional `expect_sha`). The Markdown summary is on the run; the JSON is the
artifact `production-sentinel-<run id>` (90 days).

## 5a. Reconciling the Rhodes prompt to the dashboard

When the ElevenLabs dashboard is the approved source of truth, the code is
reconciled to it — never by retyping. `GET /api/health/rhodes-agent` (same
monitor secret; 403 opaque, 503 unconfigured, 502 provider category) returns
the live System prompt and First message **exactly**, plus the declared
placeholder names and the agent id. Nothing is logged. The "Rhodes agent
export" workflow (`workflow_dispatch`) fetches it with the GitHub secret and
uploads it as a 1-day artifact, printing only key names and lengths. Then:

```bash
gh run download <run id> -D export
npx tsx scripts/rhodes-voice-agent-sync.mts export/rhodes-agent-export-<run id>/rhodes-agent.json
npx tsx scripts/rhodes-voice-agent-config.mts
```

The sync script rewrites `RHODES_VOICE_SYSTEM_PROMPT` and
`RHODES_VOICE_FIRST_MESSAGE` byte-for-byte; the tests and the sentinel's
drift checks then pin the repository to the published agent.

## 6. One-time setup

1. Generate a secret (`openssl rand -hex 32`).
2. Vercel → project `analyzer` → Production: `HEALTH_MONITOR_SECRET` (Sensitive),
   then redeploy (env is read at deploy time).
3. GitHub → repository secret `HEALTH_MONITOR_SECRET`, same value.

Rotation: set the new value in both places, redeploy, run once. The old value
stops working the moment the new deployment is live.

## 7. Reading a result

* `application.deployment_identity FAIL` right after a merge — the alias had
  not moved to the new deployment within ~90 s; re-run the workflow.
* `rhodes.system_prompt_drift WARN … wording differs` — the dashboard prompt
  and `src/lib/rhodes-voice/agent-prompt.ts` disagree. Reconcile one way or
  the other (`docs/rhodes-voice-agent-config.md` is generated from the code),
  then the check turns PASS. A missing *structural* clause is RED because the
  agent has lost the report binding.
* `supabase.report_claims_stale FAIL` — a preparation lease was never
  released; `scripts/inventory-incomplete-reports.mts` and
  `docs/paid-fulfillment.md` §4 describe the offline recovery. The sentinel
  never deletes a claim.
* `stripe.fulfillment_recent FAIL … never processed` — a webhook delivery
  crashed after the ledger insert; Stripe's retry will be acknowledged as a
  duplicate, so the grant must be verified by hand.
* `pipeline.fixture_escape_hatch_unset FAIL` — remove
  `CHRP_ALLOW_FIXTURE_REPORTS` from Production and redeploy.
