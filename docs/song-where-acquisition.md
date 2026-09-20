# Song Where autonomous acquisition

The feature flag controls customer visibility, not the authenticated jobs. A
scheduled cycle validates the EPI engine, discovers sources, ingests, expires,
matches, alerts only if separately enabled, and reports aggregate health.
Each stage can be independently paused with `SONG_WHERE_<STAGE>_ENABLED=false`.

## Source admission

Discovery checks only public, unauthenticated HTTPS pages and their advertised
RSS/Atom/JSON feed links. It does not log in, bypass paywalls, or follow
redirects. A discovered feed is admitted only when robots permits access and
the source publishes an explicit CC0 license link. Other candidates remain
quarantined in `opportunity_source_candidates`; they never become supply.
The initial public starting points are Played, HRDRV Pitch, Tracksynk and The
Sync Brief. None is assumed to be an approved opportunity source.

Registered feeds are bounded to ten per cycle, fifty items each, and an eight
second request timeout. Only an item with an explicit open/closed status,
publisher ID, title, provenance URL and separate submission URL becomes an
opportunity. Budget, use, territory, mood and deadline stay unknown when absent.
Unstructured descriptions never become CHRP target scores. Feed failure
quarantines that source and leaves other sources running.

## Inbound newsletters

`POST /api/song-where/inbound` is ready for an existing CHRP-controlled inbound
mail delivery system. It requires `SONG_WHERE_INBOUND_SECRET` (32+ characters)
and an `x-chrp-signature` containing the lowercase hexadecimal HMAC-SHA256 of
the raw JSON body. JSON must contain `messageId`, `from`, `subject`, `text`,
`receivedAt`, `dkimPass` and `spfPass`. Only a previously admitted newsletter
sender with verified reuse rights can publish an opportunity. Missing explicit
source/submission URLs or status causes quarantine, not inference. Message IDs
are deduplicated. No inbound provider or newsletter subscription is silently
assumed or provisioned.

## Release and health

Apply the acquisition migration before deploying this code. Keep
`SONG_WHERE_ENABLED=false` and `SONG_WHERE_ALERTS_ENABLED=false` until a
legitimate automatically ingested brief, match and routing destination are
verified. The authenticated `health` stage reports only aggregate counts for
sources, opportunities, parse failures, matches, clicks, alerts and source
failures. It does not expose scores or protected scoring internals.
