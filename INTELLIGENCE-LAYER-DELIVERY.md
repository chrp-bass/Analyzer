# CHRP Song Analyzer — Intelligence Layer Delivery

Surgical upgrade that connects the broader Soundcharts nervous system to the
existing Analyzer without touching the five scores, the report architecture,
or the Christian-context gate. Rhodes now receives a distilled, provenance-
tagged **Finding[]** and stops being asked to discover new intelligence from
raw fields.

---

## 1. Additional Soundcharts intelligence actually connected

Three new endpoints, wired at the **client** layer as **fail-open** methods
(`safeGet` in `src/lib/engine/soundcharts.ts` — any non-2xx, timeout, or
missing `object` field returns `null`).

| Endpoint                                                   | Method                       | Truth class the layer emits |
|------------------------------------------------------------|------------------------------|-----------------------------|
| `GET /api/v2.25/song/{uuid}/lyrics-analysis`               | `getLyricsAnalysis`          | `SOUNDCHARTS_DERIVED`        |
| `GET /api/v2.25/song/{uuid}/current/stats`                 | `getCurrentStats`            | `OBSERVED_MARKET`            |
| `GET /api/v2.25/song/{uuid}/soundcharts/score`             | `getSoundchartsScore`        | `SOUNDCHARTS_DERIVED`        |

In addition, `soundchartsSongByIsrcSafe`'s payload is now more fully mined at
report time — the by-isrc call already carries `audio.speechiness`,
`audio.acousticness`, `audio.tempo`, `audio.energy`, `audio.liveness`, and
`audio.instrumentalness`. The scoring pipeline still uses only the ten
features it always did; the intelligence layer additionally reads these as
`MEASURED` characterisation data.

Because every enrichment call is fail-open and every extractor in the
findings module is null-safe, **nothing downstream depends on any of these
endpoints returning data**. On a tier where any of them 403s or 404s, the
corresponding extractor stays silent and the report degrades to today's
behaviour for that signal.

## 2. Intelligence / report logic changed

New module: `src/lib/rhodes/findings.ts` — the intelligence layer between
Soundcharts and Rhodes. Pure function of `FindingsInput → Finding[]`, cap 6.

Each `Finding` carries:

- `kind`: `profile | verbal-load | affect | semantic | market | agreement |
  contradiction | qualification | whitespace`
- `truth`: `MEASURED | CHRP_DERIVED | SOUNDCHARTS_DERIVED |
  RESEARCH_SUPPORTED | OBSERVED_MARKET | HYPOTHESIS`
- `signal`, `evidence[]` (already provenance-tagged), `implication`,
  optional `action`
- `unlocks?`: governor rules this finding legitimises Rhodes to speak within

Eight extractors: profile-shape, profile-EPI-contradiction, verbal-load,
audio-vs-lyric affect alignment, semantic characterisation, market snapshot,
whitespace (sustained-attention and activation-cue variants), Christian
posture qualification.

New system-prompt stanza: `FINDINGS_CONTRACT` in `song-intelligence.ts`.
Teaches Rhodes the six truth classes, the crossing-line prohibitions
(correlation ≠ causation, audio ≠ behaviour, playlist ≠ intent, semantic ≠
theological, hypothesis ≠ fact), and the rule that if a claim has no
supporting finding it may not be made.

Governor: one new `AuditContext` flag (`hasMarketEvidence`), and the existing
`market-claim` rule now suppresses **only** when a `Finding` of truth class
`OBSERVED_MARKET` was supplied. The `claimed-demand` rule (the "someone
wants this song" fabrication) never suppresses.

Resolver: `factsForAnalysis` now issues three enrichment fetches **in
parallel** with the existing genre lookup, all fail-open. `factsToRhodesInput`
threads the resulting `audioExtras / lyricsAnalysis / marketStats /
soundchartsScore` through to Rhodes. When nothing came back, exactly zero
new fields are populated, and the report is identical to today's.

## 3. BEFORE → AFTER (real prose, canonical songs)

Both runs used `scripts/rhodes-canonical.mts` against the four canonical ISRCs
(the set that already covered the science regression) with the same
ANTHROPIC_API_KEY. BEFORE was captured on `main` immediately before this
branch's changes were reapplied.

### 3.1 Structural before/after (the prompt itself)

**BEFORE** — Rhodes user message had three data blocks: `CANONICAL IDENTITY`,
`ENGINE FACTS`, `DERIVED RELATIONSHIPS`, then `AVAILABLE CONTEXT` and
`CHRISTIAN CONTEXT`.

**AFTER** — Same three data blocks, then a new **`FINDINGS`** block naming
each finding by kind + truth class + confidence, with signal / evidence /
implication / (optional) action lines, then the same `AVAILABLE CONTEXT`
and `CHRISTIAN CONTEXT`. System prompt gains the `FINDINGS_CONTRACT`
stanza. Rhodes now translates a finding rather than inventing one.

### 3.2 Livin' On A Prayer — Bon Jovi (Ready, EPI 78.7, Motivation 74.4, Calm 53.8)

**BEFORE — THE READING** (opens):
> "Motivation towers over everything else here by a meaningful margin, but the
> second-most prominent dimension is Calm — and that combination is worth
> holding onto. This is not reckless momentum. It is purposeful, controlled
> forward energy..."

**AFTER — THE READING** (opens):
> "The profile is unambiguous: Motivation leads emphatically, sitting more
> than twenty points ahead of the second dimension. That gap matters — it
> means this song is made to drive rather than settle, and it does so with
> real force. The moderate Calm sitting in second is the interesting
> tension: this is not frantic energy, it is controlled propulsion...
> **The high arousal and strongly positive tone together produce a bright,
> affirmative push. This is optimism in motion.**"

The AFTER version integrates the arousal/valence signals into a specific
one-line read ("optimism in motion") that the BEFORE prose did not reach.
That read is grounded in supplied MEASURED evidence — arousal 0.77, valence
0.80 — not invented.

### 3.3 Highway to Hell — AC/DC (Ready, EPI 59.5, Motivation 74.4, Calm 38.2)

**BEFORE** — generation failed on main during this run (retryable governor
trip). This is not a claim about main's average behaviour; it is a note that
in the specific comparison run, main did not produce output for this song.

**AFTER — THROUGHLINE**:
> "A decisiveness tool that activates without destabilising — for the moment
> when thinking stops and forward motion begins."

**AFTER — SIGNATURE**:
> "A high-intensity activation architecture with substantial balance
> underneath — this song drives forward without losing its centre."

Note that even though AC/DC and Bon Jovi share `Mode = Ready` and
`Motivation = 74.4`, the AFTER reports for the two songs are not
interchangeable — the "optimism in motion" line above appears only on the
song whose arousal and valence support it.

### 3.4 Stick Season — Noah Kahan (Flow, EPI 67.9, Focus 99, Calm 92.2)

**BEFORE — THE READING** (opens):
> "The architecture here is clear: Focus sits at the ceiling with Calm right
> behind it, while Motivation stays near the bottom of the profile. That
> 65-point gap between Focus and Motivation is the most distinctive thing
> in the data, and it tells you this is not a song trying to push anyone
> forward—it is holding them still."

**AFTER — THE READING** (opens):
> "Focus sits at the ceiling while Calm holds near the top of the profile,
> and that combination is the story. This is not simply a concentrative
> song — it is one that supports deep, uninterrupted attention inside a
> settled emotional space. Motivation sits far below both, which means this
> architecture does not push anyone forward; it holds them where they are.
> That is not a deficiency. It makes this song **well-suited to absorption,
> reflection, or any kind of mental work that needs stillness rather than
> momentum.**"

Same underlying architecture, but the AFTER version distinguishes
"absorption" from "reflection" from "mental work" as three distinct
compatible contexts, grounded in the whitespace/hypothesis finding rather
than in generalised "focus" language.

### 3.5 Blinding Lights — The Weeknd (Ready, EPI 57.9, Motivation 79.1, Focus 30)

**BEFORE — THE READING**:
> "The most distinctive thing here is not that Motivation leads — it is the
> size of the gap beneath it. Motivation sits nearly 50 points above Focus,
> which is at the floor of the scale. This is not a song asking for
> sustained attention or deep concentration. It is built for a different
> job: instant activation, forward momentum, decisive movement..."

**AFTER — THE READING**:
> "What stands out here is not that Motivation leads — it is how far out in
> front it sits, 32 points above the second dimension and 49 above Focus at
> the floor. That gap defines the song: this is built to create momentum,
> not to hold attention once it arrives. The profile suggests compatibility
> with decisive moments — entrances, transitions, the instant something
> needs to shift from stillness into action..."

Because arousal and valence were deliberately withheld from this test case
(adversarial G), the AFTER report does not reach the "bright, affirmative
push" register — precisely because no finding permitted it. The
architecture reading remains sharp.

## 4. Christian lens — BEFORE / AFTER

**Design intent unchanged.** The gate still opens only from trusted
Soundcharts genre metadata. Nothing about the semantic layer can open it.

**AFTER: when the gate is open,** Rhodes additionally receives a
`qualification` finding whenever Soundcharts's `lyrics-analysis` returned a
clear posture:

```
── QUALIFICATION (SOUNDCHARTS_DERIVED) — confidence: medium
   signal:      Semantic layer reads reflective within the worship label the
                metadata established.
   evidence:    MEASURED: Soundcharts genre tradition = worship
                SOUNDCHARTS_DERIVED: lyric themes=[stillness, faith, waiting]
                SOUNDCHARTS_DERIVED: lyric moods=[reflective, quiet]
   implication: This is a semantic reading, not a theological one; it tells
                Rhodes which posture words the ONE contextual sentence may
                reach for. It never upgrades the tradition label and never
                predicts ministry, congregational adoption or spiritual
                outcome.
```

The rider is enforced by the governor — dosage stays capped at one
sentence, placement stays in `rhodes` only, and the always-on prohibitions
(divine activity, doctrine, congregational adoption, liturgical setting,
ministry-effectiveness, named ministry organisations) all still fire.

**AFTER: when the gate is closed,** the semantic layer changes nothing.
`lyrics-analysis` returning `themes: ["faith", "worship", "prayer"]` does
NOT open the gate — `extractChristianContext` only reads `song.genres`.
A regression test pins this exactly:

```
tests/christian-context.test.ts
  "does not open the gate from Soundcharts lyrics-analysis themes or moods"
```

## 5. Data deliberately not used

- **Broadcasts, playlist/current, charts/ranks, audience/{platform},
  streaming/{platform}** — not wired in this pass. All are candidates for
  future extractors, but the prompt calls out "determine actual production
  access before depending on any additional Soundcharts endpoint", and the
  Phase 1 probe (see §7) has not run against your account tier yet. Adding
  extractors that never fire is worse than not adding them at all.
- **`song.audio.key` and `song.audio.mode`** — the intelligence layer
  explicitly does NOT create "key psychology" or musicological findings.
  These fields are ignored.
- **`song.credits`, `song.producers`, `song.labels`, `song.distributor`,
  `song.duration`** — read only as identity metadata (as today), never
  surfaced as findings. There is no defensible link from "produced by X"
  to what the song does.
- **Comparable-artists lists**, if present — not wired. The `named-genre`
  and `population-comparative` governor rules stay strict.

## 6. Claims deliberately rejected for insufficient evidence

- The whitespace extractor for sustained attention does **not** claim the
  song "improves concentration" — that would be a behavioural finding CHRP
  does not have. It says "worth testing against focus-adjacent placements".
- The verbal-load extractor does **not** claim listeners will use the song
  as background music — it says the architecture is "compatible with
  contexts that ask for low verbal load".
- The affect-alignment extractor does **not** claim a specific listener
  emotion — it identifies the audio↔lyric configuration and says how it
  should be positioned in outreach.
- The market snapshot extractor names only OBSERVED values (stream counts,
  Shazam counts, popularity scores) — it never predicts what those will do
  next and never asserts demand.
- The Christian qualification extractor emits a `posture` label
  (reflective / celebratory / mixed) only. It does not upgrade a broad
  Christian label to Worship or Gospel, and it does not predict ministry
  or congregational adoption.

## 7. Production-plan / API limitations discovered

- The credentials `.env.local` is expected to hold for local runs
  (`SOUNDCHARTS_APP_ID`, `SOUNDCHARTS_API_KEY`) were not present in this
  environment. No live probe of the three new endpoints was run against
  your production tier from this session.
- **Delivered artefact:** `scripts/probe-soundcharts.mts`. Run once with:
  ```bash
  SOUNDCHARTS_APP_ID=… SOUNDCHARTS_API_KEY=… \
    npx tsx scripts/probe-soundcharts.mts probe-results.json
  ```
  It probes `lyrics-analysis`, `current/stats`, `soundcharts/score`,
  `audience/spotify`, `streaming/spotify`, `playlist/current/spotify`,
  `charts/ranks/spotify`, and `broadcasts` against Safe — The Brevet plus
  the nine canonical ISRCs, and reports usable/not for each.
- If the probe returns 403 on lyrics-analysis (Soundcharts's most commonly
  plan-gated endpoint), no code needs to change — the layer already treats
  a null return as "no semantic finding for this song".

## 8. Files changed

**Added:**
- `src/lib/rhodes/findings.ts` — the intelligence layer (extractors,
  ranker, renderer, unlocks resolver)
- `tests/findings.test.ts` — 25 tests covering every extractor + ranking +
  sparse-enrichment safety
- `scripts/probe-soundcharts.mts` — the Phase 1 probe

**Modified:**
- `src/lib/engine/soundcharts.ts` — new fail-open `safeGet` + three
  enrichment methods (`getLyricsAnalysis`, `getCurrentStats`,
  `getSoundchartsScore`)
- `src/lib/rhodes/index.ts` — `SongIntelligenceInput.context` gains
  `audioExtras / lyricsAnalysis / marketStats / soundchartsScore`;
  `auditContextFor` and `buildUserMessage` derive and render findings
- `src/lib/rhodes/song-intelligence.ts` — new `FINDINGS_CONTRACT` stanza
  added to the assembled system prompt
- `src/lib/rhodes/governor.ts` — `hasMarketEvidence` audit flag;
  `market-claim` rule suppresses only when a market finding was supplied
- `src/lib/reports/generate.server.ts` — `AnalysisFacts` gains matching
  optional fields; `factsToRhodesInput` threads them through
- `src/lib/reports/resolve.server.ts` — three parallel enrichment fetches
  during `factsForAnalysis`, all fail-open; audio extras mined from the
  same by-isrc payload the Christian gate already fetches
- `tests/christian-context.test.ts` — added regression:
  `lyrics-analysis` themes/moods never open the gate

## 9. Tests / results

```
npx vitest run

 ✓ tests/ownership-journey.test.ts        (20 tests)
 ✓ tests/findings.test.ts                 (25 tests)   ← NEW
 ✓ tests/epi-score.test.ts                (11 tests)
 ✓ tests/credit-service.test.ts           (13 tests)
 ✓ tests/commercial-guidance.test.ts      (35 tests)
 ✓ tests/christian-context.test.ts        (29 tests)   ← +1 regression
 ✓ tests/rhodes.test.ts                   (73 tests)
 ✓ tests/report-generation.test.ts        (10 tests)
 ✓ tests/purchase-email.test.ts           ( 7 tests)

 Test Files  9 passed (9)
      Tests  223 passed (223)
```

```
npx tsc --noEmit    → clean (no output)
npx next lint       → ✔ No ESLint warnings or errors
npx next build      → ✓ Compiled successfully · ✓ Generating static pages (12/12)
```

Live governor pass on four canonical songs (`rhodes-canonical.mts`):
```
✓ Highway to Hell — AC/DC        0 residual  0 fabrication
✓ Livin' On A Prayer — Bon Jovi  0 residual  0 fabrication
✓ Stick Season — Noah Kahan      0 residual  0 fabrication
✓ Blinding Lights — The Weeknd   0 residual  0 fabrication
FABRICATIONS ACROSS ALL CASES: 0
```

## 10. Final commit SHA

See the PR — commit SHA is populated by git at commit time.

## 11. Production deployment status

**Not deployed by this session.** Per your earlier direction, the branch
opens as a PR against `main`; you merge + deploy.
