# Song Where V1 operations

Song Where reads completed analyses and reports after entitlement checks. It
stores only in `0004_song_where.sql` tables. The Analyzer's scan, report,
checkout, email return and Rhodes paths do not call Song Where.

## Release order

1. Apply `db/migrations/0004_song_where.sql` to the Analyzer Supabase project.
2. Set a random `SONG_WHERE_JOB_SECRET` (at least 32 characters) in Vercel
   Production and in the GitHub repository Actions secret of the same name.
3. Deploy with `SONG_WHERE_ENABLED=false`. Verify normal Analyzer health and
   that Song Where routes return 404.
4. Set `SONG_WHERE_ENABLED=true` and redeploy. Run `workflow_dispatch` for the
   Song Where workflow. Check the bounded ingest, match and alert responses.
5. Leave `SONG_WHERE_ALERTS_ENABLED=false` until a real opportunity, song
   match, routing click and email opt-in have been verified in production.

The workflow can be disabled independently in GitHub Actions. Turning off the
server flag and redeploying hides all Song Where UI and routes without changing
Analyzer data or entitlements.

## Source admission

No external feed is configured by default. A feed needs documented permission
to use its data, an HTTPS machine-readable URL, stable IDs, a direct official
submission URL and explicit song-target fields. An account-scoped API does not
grant rights to republish other accounts' briefs. Public HTML pages do not
become an authorized feed merely because a browser can read them.

The JSON feed adapter accepts at most 50 items per run:

```json
{
  "items": [{
    "id": "publisher-stable-id",
    "title": "A current music brief",
    "description": "Publisher-supplied text",
    "submissionUrl": "https://publisher.example/submit/id",
    "deadline": "2026-10-01T00:00:00Z",
    "status": "open",
    "target": {
      "modes": ["Ready"],
      "dimensions": { "motivation": { "min": 70, "max": 99 } },
      "arousal": { "min": 0.7, "max": 1.0 }
    }
  }]
}
```

Targets are accepted only when supplied explicitly. A brief without valid
target fields remains unmatched. The adapter never guesses mood from prose.
Replace or extend the adapter under `src/lib/song-where/sources/` only after a
publisher's actual feed shape and reuse rights are verified.

## Privacy and failure boundaries

Every Song Where table has RLS with no browser policy. The service role alone
reads scores and submission URLs. Client DTOs expose qualitative fit and a
CHRP redirect only. Alerts require opt-in and a separate production flag.
Feed, matching, email and redirect failures do not enter Analyzer's paid path.
