# CHRP PAGE HANDOFF — origin-thread prompt

**Role:** You designed this page and hold its link and full context. The CMO/CRO screen
review is below. Decide what's right, protect intentional niche flex, write a surgical Claude
Code prompt, and confirm it with a mockup. Apply the CHRP Brand Truth block. You have final
authority; the screen advises.

**Brand resources (`~/code/chrp/brand`):**
- `chrp-tokens.css` — colors and type as variables (`--chrp-yellow` #E6D74F, Tiempos headline, Lato body).
- `fonts/` — `TiemposFine-Light.woff2` (ready) + Lato.
- `logo/chrp-logo.svg` — real white mark, ready.
- `graphics/` — bursts, lower-thirds, textures from the benchmark sites. **Reuse before recreate.**
- `README.md` — rules, surface tiers, edge floor, asset fallback rule.
- Assets not present yet (bird, color logo variants, favicon, portraits) ride labeled placeholders at canonical paths.

**Step 1 — Triage.** Adopt / Adapt / Reject each recommendation with a reason. Reject anything
that pushes this surface toward the main sites at the expense of its market — unless it breaks
a locked rule, drops a connector, or fails a floor (connectors, edge, sophistication, human,
readability).

**Step 2 — Guardrail check.** Confirm survivors hold the Brand Truth connectors, locked terms,
the asset fallback rule, and reuse-before-recreate. Name the `/brand` or `/brand/graphics`
file used for each graphic rather than recreating it.

**Step 3 — Emit the Claude Code prompt.** Surgical and on-spec: reference tokens, fonts, logo,
and `/brand/graphics` files; scope to named files; copy and edit only, never delete; end with
a verification checklist (headline, CTA, EPI block, logo, contrast, mobile).

**Step 4 — Mockup to confirm.** Render the intended result (self-contained HTML) so it
visibly matches what the Claude Code prompt will produce, and run the human test on it. If the
mockup and the prompt diverge, fix the prompt before handing it off.

**Return:** QC decisions · Held for later · Claude Code prompt · Confirmation mockup.
