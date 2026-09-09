# Dr. Rhodes voice — operations

Dr. Rhodes **text** intelligence and Dr. Rhodes **voice** are separate systems.
The text is generated and persisted before checkout and rendered from
persistence. Voice is an optional, post-render ElevenLabs Agents
(Conversational AI) session that the creator starts by clicking. Voice can
never generate, regenerate, modify, block or delay the report.

## 1. Architecture

```
rendered entitled report
  └─ click "Hear Dr. Rhodes"            (RhodesVoice.tsx → RhodesVoiceSession)
       ├─ getUserMedia({audio})          denial → panel note, NO server call
       ├─ POST /api/rhodes/session       { scanId }
       │    ├─ resolveEntitledReport     entitlement + persisted read (pure)
       │    │     denied → same opaque 403 as the JSON route, NO ElevenLabs call
       │    ├─ readRhodesVoiceConfig     typed error → 503 {retryable:false}
       │    └─ mintSignedUrl             GET …/convai/conversation/get-signed-url
       │          ?agent_id=…  header xi-api-key (server-only)
       │          transient → retry (bounded) → 503 {retryable:true}
       │          definitive → 502 {retryable:false}
       └─ Conversation.startSession({ signedUrl, connectionType:"websocket" })
            pre-open failure → ONE fresh mint + reconnect; then panel note
            post-open provider close → classified (close code + reason)
              override_rejected / silent 1006 → ONE fresh mint WITHOUT overrides
              anything else (auth, quota, voice, llm, …) → panel note, no retry
            stop / unmount / pagehide → endSession (socket + microphone closed)
       └─ POST /api/rhodes/session/outcome   browser lifecycle → production log
```

Modules (all under `src/lib/rhodes-voice/`):

| module | role |
| --- | --- |
| `config.ts` | reads + validates the two env vars; typed `RhodesVoiceConfigError`; **no fallback** |
| `elevenlabs.ts` | typed server-only client: timeout, deadline, retry policy, classification |
| `signed-url.ts` | server facade the route calls (config → client) |
| `log.ts` | closed-schema `[rhodes-voice]` structured logging (values allow-listed) |
| `session-controller.ts` | browser lifecycle state machine (no React, no SDK) |
| `close-reason.ts` | classifies a post-open provider close/error into a category; decides the single override-free reconnect |
| `api/rhodes/session/outcome` | write-only, entitlement-gated telemetry: browser lifecycle events → `[rhodes-voice]` production log |
| `context.ts`, `first-read.ts`, `text.ts` | pure adapters over the persisted report: bounded `report_context`, the two-sentence opening, data hygiene |
| `agent-prompt.ts` | the exact ElevenLabs System prompt / First message the agent must carry (mirrored into `docs/rhodes-voice-agent-config.md`) |

The signed URL is minted once per attempt, handed to the browser once, used
immediately, and never cached, persisted, logged or reused. Per the official
docs a signed URL is valid for 15 minutes and a conversation may outlive
that window, but a new connection with the same URL must not be attempted;
the browser controller refuses a URL it has already used. The API key never
leaves the server.

Source of truth: <https://elevenlabs.io/docs/eleven-agents/customization/authentication>
and <https://elevenlabs.io/docs/api-reference/conversations/get-signed-url>.

### Report → conversation binding

`POST /api/rhodes/session` builds `RhodesVoiceContext` from the persisted report
(after entitlement) and returns it as ElevenLabs **dynamic variables**:
`song_title`, `song_artist`, `epi_score`, `epi_mode`, `first_signal` and
`report_context` (≤ 7000 chars, every section, labelled, data-only). The agent's
System prompt and First message reference them with `{{name}}` — see
`docs/rhodes-voice-agent-config.md` for the exact text and the one-time
dashboard edit. No override is sent. The route logs
`event=context-built chars=… result=complete|trimmed_…` per session.

### Conversational lead (governed) and the source of truth

The **published ElevenLabs agent is the approved source of truth**; the code
is reconciled to it, never the other way round. `RHODES_VOICE_SYSTEM_PROMPT`
and `RHODES_VOICE_FIRST_MESSAGE` in `src/lib/rhodes-voice/agent-prompt.ts`
are byte-for-byte copies of the published text (synced 2026-09-09; see
`docs/production-sentinel.md` §5a for the export → sync procedure), mirrored
into `docs/rhodes-voice-agent-config.md`.

The published System prompt carries **HOW TO LEAD THE CONVERSATION**: Rhodes
leads a guided discovery — reveal one report-grounded signal, explain why it
matters, ask one thoughtful question, listen, progressively deepen, suggest
one report-grounded experiment, then ask again; every substantive response
ends with exactly one concise, context-specific reflective question; generic
prompts are never used; fame, fortune, virality, placement, audience growth
or commercial success are never promised. The First message ends with a
reflective question. `RHODES_VOICE_GOVERNED_CLAUSES` pins these as
behavioural clauses and the report binding as structural clauses; the
production sentinel (boundary 5) reads the live agent after every production
deployment and nightly: exact match PASS, wording drift WARN, lost structural
clause RED.

## 2. Required Vercel variables

| variable | scope | type | value |
| --- | --- | --- | --- |
| `ELEVENLABS_API_KEY` | Production (and Preview if voice should work there) | **Sensitive** | workspace key with the minimum Agents permission needed to create a signed session |
| `ELEVENLABS_RHODES_AGENT_ID` | Production (and Preview) | **Plain / encrypted, NOT Sensitive** | the DR Rhodes agent id, copied from the agent's URL in the owning workspace |

Rules:

* Store bare values. No quotes, no trailing newline or whitespace. The server
  trims surrounding whitespace but rejects quotes, internal whitespace and
  placeholders as `malformed_*`.
* The agent id is not a secret. Keep it auditable (`vercel env ls` shows
  `Encrypted`, and the value can be read back with the API). Do **not** mark
  it Sensitive — a Sensitive value cannot be audited and a paste error hides
  behind a 401 for days.
* No branch overrides. One value per environment.
* A missing or malformed value does not break the report; it makes the voice
  route return `503 {error:"voice_unavailable", retryable:false}` and logs
  `event=configuration-invalid code=… variable=…`.

Redeploy after every environment change. Vercel injects env at build/deploy
time; editing a variable does nothing to the running deployment.

## 3. Key rotation procedure (with the mandatory one-time-reveal pause)

Rotate only when evidence shows the deployed key is rejected
(`category=invalid_api_key`), belongs to the wrong workspace, or lacks
permission (`category=missing_permissions`). A bare 401 is not evidence
by itself — read the category.

1. In the ElevenLabs workspace that owns **DR Rhodes**, open
   *Developers → API keys → Create key*.
2. Name it `CHRP Analyzer Production — YYYY-MM-DD`. Restrict it to the
   minimum Agents / Conversational AI permission needed for
   `get-signed-url`. Leave the credit quota unrestricted or set a sane cap.
3. **When the one-time value is shown, stop.** Whoever is driving must say
   exactly: *"The new ElevenLabs key is visible once. Copy it and save it
   securely now, then reply SAVED."* Do not close the dialog, navigate away,
   paste it into any other service, or continue until the owner replies
   `SAVED`.
4. Write it to Vercel **Production** as Sensitive, without echoing it into a
   terminal, chat, log, screenshot or clipboard history:
   `vercel env add ELEVENLABS_API_KEY production --sensitive` (paste when
   prompted), or the dashboard's *Sensitive* toggle.
5. Redeploy (`vercel redeploy <current production url>` or push to `main`)
   **after** the environment write has completed.
6. Run the smoke test below. **Keep the previous key enabled until the new
   key passes real production voice verification.** Never delete keys during
   a repair; disable the old one afterwards, delete it later.

## 4. Deployment / redeployment order

1. Env change (agent id and/or key) → 2. redeploy → 3. confirm the alias
`scan.chrp.ai` points at the new READY deployment (`vercel ls`, or the
project's `targets.production` via the API) → 4. smoke test → 5. only then
touch the old key.

## 5. Production smoke test

From an entitled report (e.g. `/scan/<scanId>/preview`), with the report
already rendered:

1. Click **Hear Dr. Rhodes** → the browser asks for the microphone first.
2. Network: `POST /api/rhodes/session` → `200`, response has `signedUrl`
   (`wss://…`), `agentId`, `dynamicVariables`, `overrides.agent.firstMessage`.
   The response header `X-Rhodes-Request-Id` correlates the server logs.
3. A WebSocket to `api.elevenlabs.io` opens; Rhodes speaks the first read.
4. Ask one short question; Rhodes answers.
5. Click **End** → socket closes, the tab's microphone indicator goes away.
6. Start again → a **new** `POST /api/rhodes/session`, a different signed URL.
7. Deny the microphone once → panel note only, **no** `/api/rhodes/session`
   call, report unchanged.
8. `vercel logs -p analyzer --environment production -q "[rhodes-voice]"`
   shows `configuration-valid → signed-url-requested → signed-url-succeeded →
   session-started`, no `signed-url-failed`, no key, no `wss://`.

## 6. Safe rollback

Voice is isolated: rolling it back never touches the report. Options, in
order of preference:

* **Config rollback**: restore the previous `ELEVENLABS_API_KEY` (the old
  key is still enabled — see §3) and redeploy.
* **Deployment rollback**: `vercel rollback <previous production deployment>`
  (or *Promote to Production* on the previous READY deployment). Env values
  are re-read at deploy time, so pair with the config you want.
* **Disable voice**: remove/blank `ELEVENLABS_RHODES_AGENT_ID` and redeploy.
  The panel shows "Voice is unavailable right now"; the report is unaffected.

## 7. Troubleshooting matrix

Read `category=` from `[rhodes-voice] event=signed-url-failed` (server logs).

| upstream | category | meaning | action | retried? |
| --- | --- | --- | --- | --- |
| 401 | `invalid_api_key` | key value wrong, disabled or from another workspace | verify the deployed value shape (no quotes/whitespace), verify the key is enabled in the workspace that owns DR Rhodes; rotate per §3 | no |
| 401 | `needs_authorization` | header missing (config/proxy stripped it) | config; header must be `xi-api-key` | no |
| 401/403 | `missing_permissions` | restricted key lacks the Agents permission | edit key permissions or rotate | no |
| 401 | `unauthorized` | 401 with an unrecognised body | inspect ElevenLabs status page; treat as key problem | no |
| 403 | `forbidden` | workspace/agent policy refusal (e.g. auth not enabled on the agent, allowlist) | check agent *Security → Authentication* (enable) and any domain allowlist | no |
| 404 | `agent_not_found` | agent id wrong or not in this key's workspace | copy the id from the agent URL in the owning workspace; set the plain env var; redeploy | no |
| 400/422 | `invalid_request` | malformed agent id / request | validate `ELEVENLABS_RHODES_AGENT_ID` | no |
| 408 / abort | `timeout` | upstream slow | transient; watch frequency | yes (bounded) |
| 429 | `rate_limited` | quota / concurrency | check plan limits, concurrency | yes (bounded) |
| 5xx | `upstream_unavailable` | ElevenLabs incident | status page | yes (bounded) |
| — | `network` | DNS/TLS/socket failure from Vercel | transient | yes (bounded) |
| 2xx | `malformed_response` | no `signed_url` in body | API contract change; check docs | no |
| — | `configuration-invalid` | env missing/malformed (see `code=`, `variable=`) | fix the variable; redeploy | n/a |

Retry policy: max 3 attempts, 4 s per attempt, 9 s total, exponential
backoff with full jitter (250 ms base, 2 s cap). Never on 400/401/403/404/422.

### Post-open (WebSocket opened, then closed) — `event=provider-failure`

The browser reports these to the outcome route, so they appear in
`vercel logs … -q "rhodes-voice"` with `stage=browser`, the same `request_id`
as the mint, the ElevenLabs `conversation_id`, and the `close_code`. The
provider's exact reason text is printed once in the browser console
(`[rhodes-voice] provider reason: …`), never in a structured log.

| category | meaning | action |
| --- | --- | --- |
| `override_rejected` | the agent's **Security** tab does not allow the `first_message` override we send | only reachable if a future server version sends an override (production sends none). The client reconnects once with dynamic variables only (`retry result=drop_override`, then `session-started result=context_only_after_rejection`) |
| `dynamic_variables_missing` | the agent prompt/first message references a `{{variable}}` the client does not send | add the variable to `context.ts` or remove it from the agent |
| `auth` | signed URL expired / signature invalid / agent requires authorization | mint-to-connect took too long, or the agent's auth mode changed |
| `quota` | credits, concurrency or plan limits | ElevenLabs plan |
| `voice_unavailable` | the agent's TTS voice is missing or inaccessible to this workspace | reassign a voice on the agent |
| `llm` | model / LLM configuration failure | check the agent's LLM settings |
| `max_duration` | provider ended the session at its configured cap | expected |
| `network` (close 1006, empty reason) | silent drop | treated like a rejection once (override-free reconnect), then reported |
| `unknown` | unrecognised reason | read the console excerpt; file with ElevenLabs quoting `conversation_id` |

Every teardown WE perform is logged as `session-stopped result=closed_by_<user|unmount|pagehide>`
and can never be reported as a provider failure (the lifecycle suite pins this).

Client-side pre-open (`websocket-failed result=pre_open`) → one fresh mint and
reconnect; `microphone-denied` → no server call; `graceful-degradation` →
panel note.

## 8. Confirming agent / workspace ownership without exposing secrets

* Agent id: open the agent in the ElevenLabs dashboard; the id is the last
  path segment of the URL. Compare with the plain env var
  (`vercel env ls` + API `decrypt=true` on that id only; never on the key).
* Workspace: the key list and the agent must be visible in the **same**
  workspace switcher selection. A key created in a personal workspace cannot
  sign sessions for an agent in a team workspace.
* Agent settings: *Security → Enable authentication* on; signed-URL
  authentication in use; no conflicting allowlist.
* Key: enabled; permission includes Agents / Conversational AI read (signed
  session creation). Never copy the value anywhere to check it — the
  server's `category=` classification is the check.
* Do not add a diagnostic route, public or hidden. The route's own sanitised
  log line is the diagnostic. (The outcome route is write-only telemetry:
  entitlement-gated, closed field set, returns 204 and nothing else.)

## 9. Rules

* The old key stays enabled until the new key passes §5 in production.
* Never log, print, hash, fingerprint, return or persist the key or a signed
  URL. `log.ts` allow-lists every value; anything else prints as `redacted`.
* No text chunking, MP3 synthesis, REST TTS or report-to-audio conversion.
  Voice is a Conversational AI session over a signed WebSocket, full stop.
* Failure modes belong in the automated tests, never in live credentials or
  the live agent.
