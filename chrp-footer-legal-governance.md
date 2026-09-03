# CHRP FOOTER / LEGAL GOVERNANCE

**Corporate source of truth:** chrp.ai

**Privacy:** https://chrp.ai/privacy
**Terms:** https://chrp.ai/terms

**Product Methodology:** may remain vertical-specific when the methodology is
genuinely product-specific. Song Intelligence's `/methodology` explains this
report's own scores and modes — content chrp.ai does not carry — so it stays
local and is not linked to a corporate page.

**Rule:** new CHRP web properties link to the canonical corporate Privacy and
Terms rather than create local copies, unless explicitly authorized.

## Why this exists

`/privacy` and `/terms` on this product used to render local pages whose own
copy read "CHRP's formal privacy policy is in review" / "formal terms of
service are in review" — stubs, not the real documents, while chrp.ai already
carried the actual company-wide policies. Fixed 2026-09-03: the footer's
Privacy/Terms links now point at chrp.ai directly, and the old local routes
redirect there rather than staying reachable as stale content. See
`src/components/SiteFooter.tsx`, `src/app/privacy/page.tsx`,
`src/app/terms/page.tsx`.

## Known gap, not resolved here

The retired Terms stub was also the only customer-facing statement of this
product's refund policy ("refund requests within seven days of purchase are
honored while beta is active") and its $19 / $149 pricing framing. chrp.ai's
canonical Terms does not state a refund policy. That sentence needed a home
in the product (the checkout or tier surfaces are the natural place) rather
than being invented into either Terms page as a side effect of this fix —
flagged for a deliberate follow-up, not resolved silently.
