# CHRP SONG INTELLIGENCE — ANTI-UI-SLOP AUDIT

**Date:** 2026-09-02 · **Commit audited:** `ed5955c` · **Production:** https://scan.chrp.ai
**Method:** rendered-DOM measurement (computed styles, composited contrast, layout geometry) at 390 / 768 / 1440, plus the paid report rendered locally from real generated output. No source file was modified.

---

## EXECUTIVE VERDICT

**Score: 7 / 10**

Already excellent: the bones are disciplined. Section rhythm is a consistent 100.8px, every `.wrap` shares one left edge, the radius system is a real token set actually obeyed, and the paid report is genuinely restrained — 73 layout boxes carrying only 4 borders and 4 tints. There is no card soup, no gradient cliché, no pill abuse.

What prevents world-class: a small number of objective defects that a premium product cannot carry. The header's primary CTA renders at **1.28:1 contrast** — effectively invisible. Decorative hero layers push **82–177px of horizontal overflow** at 390 and 768. The brand display face is **synthetically emboldened** in 13 places. A pricing surface renders **one card inside a four-column grid**.

The central visual problem: **the report has no hierarchy.** All seven movements are announced by an identical 10px label, and the EPI instrument — the brand's core connector — renders at 200px with 4.4px labels beside a 64px song title. Measurement is presented as the least important thing on the page.

---

## EXPERIENCE INVENTORY

**Surfaces inspected**

| Surface | Route / component | State |
|---|---|---|
| Landing | `/` · `MarketingLanding.tsx` | anonymous |
| Navigation (marketing) | `.si-nav` | sticky, dark |
| Navigation (product shell) | `SiteHeader.tsx` · `.product-shell .nav` | light glass |
| Song search | `/scan` · `ScanInput.tsx` | empty |
| Demo-track list | `/scan` | populated |
| Scan / analyze transition | `/scan/[id]/processing` · `ScanProcessing.tsx` | loading |
| ReportPreparing | `ScanPreview.tsx` → `ReportPreparing` | loading, free + paid variants |
| Free reveal (first-free) | `FreeReveal` + `Boundary` | anonymous |
| Paywall / boundary | `Boundary` | anonymous |
| **Paid report** | `ReportPage.tsx` → `ReportBody` | entitled, real generated prose |
| Report hero + EPI | `HeroPolygonAside` · `PolygonRadar.tsx` | entitled |
| Rhodes interpretation | `01 · / THE CHRP READING` | entitled |
| EPI profile | `02 · EPI PROFILE` | entitled |
| Placement Map | `03 · WHERE THIS COULD LIVE` | entitled |
| Buyer Map | `04 · WHO TO PUT IT IN FRONT OF` | entitled |
| Pitch Language | `05 · PITCH THROUGHLINE` | entitled |
| Audience Map | `06 · WHO RESPONDS, AND WHEN` | entitled |
| Commercial Next Step | `07 · WORTH CONSIDERING` | entitled |
| Ownership / KEEP THIS REPORT | `ReportOwnership.tsx` · `.rp-own` | entitled |
| Email capture / Save to My Songs | `.rp-own` actions | entitled |
| PDF affordance | `↓ Download PDF` | entitled |
| Catalog close | `CatalogClose` | entitled |
| $19 path | `Boundary` → `UNLOCK THIS SONG` | anonymous |
| $149 path | `/scan/[id]/tiers` · `TierPicker.tsx` | anonymous |
| Checkout | `/scan/[id]/checkout-tier` | anonymous |
| My Songs / Dashboard | `/dashboard` · `Dashboard.tsx` | **empty state**, anonymous |
| Sign in | `/signin` · `SignInForm.tsx` | anonymous |
| Footer | `SiteFooter.tsx` · `.foot` | all |

**Viewports tested:** 390 × 844 · 768 × 1024 · 1440 × 900.
**States covered:** anonymous, authenticated-shell, empty (dashboard), loading (processing, ReportPreparing), unavailable (`ReportUnavailable`), entitled, PAYMENT RECEIVED (`rp-paid-ack`).

**Not visually inspected:** live Stripe checkout iframe (third-party surface), magic-link claim after a real send, backward-compatible legacy report payloads. Findings below make no claims about these.

---

## WHAT ALREADY FEELS LIKE CHRP

Do not touch any of this. It is the reason the product scores 7 and not 4.

1. **Vertical rhythm is real.** Every landing section is `100.8px` top and bottom, with `115.2px` reserved for the two emphasis sections. That is a system, not per-section guesses.
2. **One container, one edge.** Every `.wrap` on the landing resolves to left `127` at 1440. Zero drift.
3. **The radius token set is obeyed.** `--r-btn/--r-input` 16px, `--r-card` 20px, `--r-pill` 999px. The landing measures exactly one non-zero radius value (16px, 8 elements); the report measures 16 / 20 / 999. No accidental 3px or 6px anywhere.
4. **The report is restrained.** 73 boxes, 4 with borders, 4 with fills. This is the opposite of card soup and it is the single most on-brand decision in the product.
5. **Editorial line length.** Report prose measures 44–53 characters at 390 and peaks at 78 at 1440 — inside the editorial band at every viewport.
6. **The hard-edged marketing / soft product split is coherent.** The landing runs 0px cards (editorial, print-like); the app runs the soft token geometry. Both are internally consistent.
7. **The search field's clipped action.** `.si-search-row` is 16px radius with `overflow:hidden`; the yellow action fills to the edge and takes the corner from its parent. This is the correct pattern, executed correctly.
8. **Dark, atmospheric hero with a genuine aura field.** The radial `--yellow → --magenta → --blue` bleed over the treated portrait is the brand's emotional signature, on-spec.
9. **The mode colour system.** Ready / Flow / Recharge / Recover each carry bg, fg, fill and stroke tokens, dark- and light-calibrated. Genuinely systematic.
10. **The product-shell logo inversion.** `filter: invert(1) brightness(0)` correctly renders the white master mark as a dark wordmark on the cream nav. Verified — the mark is not compromised.

---

## TOP 10 SLOP FINDINGS

### 1 — The header's primary CTA is illegible

**Classification:** Hard Slop
**Severity:** Critical
**Surface:** Landing navigation, `.si-nav-cta` ("SCAN YOUR SONG — FREE")
**Viewport(s):** All — 390, 768, 1440

**What is happening:**
`globals.css:996–1013` declares the CTA with `color: var(--ink)` and `font-weight: 900`. Neither applies. `.si-nav nav a` (`globals.css:988–993`) has specificity (0,1,2); `.si-nav-cta` has (0,1,0). The link selector wins. Computed values on production:

- `color: rgba(251, 251, 244, 0.7)` on `background: rgb(230, 215, 79)`
- Composited contrast: **1.28:1** (WCAG AA requires 4.5:1)
- `font-weight: 700`, not the intended 900

Near-white text at 70% opacity on CHRP Yellow. Confirmed both numerically and visually — the label washes out on the pill.

**Why it feels unintentional:** because it *is* unintentional. The author wrote the correct rule; a sibling selector silently ate it. This is the definitive template artifact: the yellow ground was added and the foreground was assumed. It is the first yellow moment a visitor sees and the site's primary conversion control.

**CHRP/app-reference mismatch:** Yellow is the umbrella signal and must read at the brand moments. A signal nobody can read is not a signal. Every other `.btn-y` in the product correctly uses `color: var(--ink)`.

**Recommended correction:** ALIGN

**Exact implementation scope:** `src/app/globals.css` — raise the CTA rule's specificity to beat `.si-nav nav a` (e.g. scope it as `.si-nav nav a.si-nav-cta`). No markup change. Restores the already-authored `--ink` / 900 intent.

**Regression risk:** Low

---

### 2 — The report has no hierarchy across its seven movements

**Classification:** Soft Slop
**Severity:** High
**Surface:** Paid report, `ReportPage.tsx` section headers
**Viewport(s):** All

**What is happening:**
Every one of the seven movement headers is measured identical:

`Lato · 10px · weight 700 · uppercase · rgb(74,69,64)` — paired with `Cormorant italic · 12px · rgb(74,69,64)`

`01 · EMOTIONAL SIGNATURE` / `02 · EPI PROFILE` / `03 · WHERE THIS COULD LIVE` / `04 · WHO TO PUT IT IN FRONT OF` / `05 · PITCH THROUGHLINE` / `06 · WHO RESPONDS, AND WHEN` / `07 · WORTH CONSIDERING` — not one differs in size, weight, or colour. Every section also carries a second lowercase italic label ("what the song is doing", "interpretation", "the four dimensions", "placement territory", "and what to lead with", "paste this anywhere", "state and context", "your call"): **16 label lines across 8 blocks**.

**Why it feels unintentional:** the measurement that the product is built on is announced in exactly the same voice as an optional closing suggestion. Repetition here creates monotony, not consistency. This is precisely what makes an otherwise excellent document read as a stack of generated text cards — not decoration, but the *absence* of differentiation.

**CHRP/app-reference mismatch:** `ReportPage.tsx:11` states the file's own rule — *"The measurement precedes the interpretation… so the reading is read as something drawn from a measurement."* The rendered output does not express that. Selective boldness and hierarchy are core to the app's product language; here nothing is selected.

**Recommended correction:** REBALANCE

**Exact implementation scope:** `src/components/ReportPage.tsx` — give the three altitudes distinct header weight, not new elements. Measurement (`02 · EPI PROFILE`) and the signature/reading pair should sit at the top altitude; the commercial application block (03–05) at a middle altitude; 06–07 at a quieter one. Achieve it with size and space on the existing label pair. **Subtract first:** the lowercase italic sub-label is the cheapest thing to drop on the quieter movements — it is the element carrying least information.

**Regression risk:** Low — presentational only; no section content, order, or generation logic touched.

---

### 3 — The EPI instrument is the smallest meaningful element in the report

**Classification:** Hard Slop
**Severity:** High
**Surface:** Report hero, `HeroPolygonAside` → `PolygonRadar`
**Viewport(s):** 1440 primarily; acceptable at 390

**What is happening:**
`ReportPage.tsx:222–228` renders the radar at `size={200}` inside an `aside` capped at `md:w-[220px]`. The SVG `viewBox` is 270 units wide, so everything scales by **0.74**. Measured effective on-screen type:

| Element | Declared | **Effective** |
|---|---|---|
| Axis labels (Focus / Balance / Motivation / Calm) | 8px | **5.9px** |
| "EPI SCORE" label | 6px | **4.4px** |
| The score itself ("76") | 38px | **28.1px** |

Beside it, the song title renders at **64px Cormorant**. At 1440 the report column is 920px wide and the instrument occupies 200px of it.

**Why it feels unintentional:** 4.4px text is below any legible floor on any display. Nobody chooses it; it is what happens when a component's internal font sizes are authored against its viewBox and then the component is scaled down by a container. The song title is more than twice the size of the measurement that justifies the purchase.

**CHRP/app-reference mismatch:** The EPI Score system — score, mode, score-as-data-viz — is a **non-negotiable brand connector**, and the app's own feature cards use the EPI arc gauge as the hero object. Here it is a 200px footnote. The brief's test "does EPI establish the signal?" currently answers no.

**Recommended correction:** REBALANCE

**Exact implementation scope:** `src/components/ReportPage.tsx:222–228` — raise the `aside` width and the `size` prop at `md`+ so effective label size clears ~11px (roughly `size` 320–360). `size` is a pure presentational prop and the SVG scales via `viewBox`; no geometry math in `PolygonRadar.tsx` needs editing. Leave 390 as-is — it already reads correctly there.

**Regression risk:** Low

---

### 4 — Report body text has five left edges and nine right edges

**Classification:** Hard Slop
**Severity:** High
**Surface:** Paid report body
**Viewport(s):** 1440

**What is happening:**
All seven section headers align perfectly at left `313`. The prose beneath them does not:

| Block | Left edge | Right edge |
|---|---|---|
| Emotional signature | 313 | 837 |
| The CHRP reading (Rhodes) | **340** | 859 |
| Placements ×3 | **353** | 820 |
| Buyers ×2 | 313 | 780 |
| Pitch throughline | 313 | 779 |
| Pitch — sync | 313 | 701 |
| Pitch — positioning | 733 | 1121 |
| Audience / Consider | 313 | 852 |
| Ownership | **348** | 786 |

Rhodes is indented 27px from its own header. Placements are indented 40px. Ownership 35px. Right edges span 701→1121 — a **158px** swing in the ragged edge between sections.

**Why it feels unintentional:** 27, 40 and 35 are not a system. No design language explains three different sub-40px indents, and there is no consistent measure, so the document's left and right edges shimmer as you scroll. These read as inherited padding from nested wrappers, not decisions.

**CHRP/app-reference mismatch:** Editorial rhythm and generous, *deliberate* negative space are core CHRP. A premium intelligence document holds one column.

**Recommended correction:** ALIGN

**Exact implementation scope:** `src/components/ReportPage.tsx` — snap body prose in the Rhodes, placement and ownership blocks to the same left edge as the section headers, and settle on one prose measure (the existing ~520px / ~78ch reads well). CSS/utility-class change only.

**Regression risk:** Low

---

### 5 — Hero decoration overflows the viewport at 390 and 768

**Classification:** Hard Slop
**Severity:** High
**Surface:** Landing hero — `.si-hero-atmos`, `.si-hero-horizon`
**Viewport(s):** 390 and 768 (1440 is clean)

**What is happening:**
`globals.css:373–393` bleeds both decorative layers past their column: atmos `left/right: -22%`, horizon `left/right: -30%`. The hero grid is `auto-fit minmax(min(100%,420px),1fr)`, so below ~840px the art column goes full width and the percentage bleed scales with it.

| Viewport | `scrollWidth` | Client width | Overflow |
|---|---|---|---|
| 390 | 472 | 390 | **+82px** |
| 768 | 939 | 762 | **+177px** |
| 1440 | 1434 | 1434 | none |

Isolated conclusively: setting `display:none` on those two elements returns `scrollWidth` to exactly 390 and exactly 762. Nothing else contributes. No ancestor clips — `overflow-x` is `visible` on the horizon, `.si-hero-art`, `.wrap`, `.si-hero` and `body`.

*Measurement note:* the layout engine reports the overflow at every level, but the pane did not pan horizontally in-session, so I am reporting confirmed unclipped scrollable overflow rather than confirmed sideways scrolling on a real device. Either way the layer escapes its container unclipped, and the fix is the same and free.

**Why it feels unintentional:** the bleed is a desktop-tuned effect that was never given a mobile boundary. A percentage bleed on a column that becomes full-width is a classic responsive oversight.

**CHRP/app-reference mismatch:** The aura is supposed to melt into the surface, not escape it. In the app the aura is bounded by the screen.

**Recommended correction:** ALIGN (one property)

**Exact implementation scope:** `src/app/globals.css` — add `overflow-x: clip` to `.si-hero` (`clip`, not `hidden`, so the sticky nav is unaffected). Single declaration. The aura is unchanged at 1440.

**Regression risk:** Low

---

### 6 — The brand display face is synthetically emboldened

**Classification:** Hard Slop
**Severity:** High
**Surface:** `TierPicker.tsx`, `Dashboard.tsx`, `CreatorProfileStage.tsx` — 13 occurrences
**Viewport(s):** All

**What is happening:**
`layout.tsx` loads exactly one Tiempos cut — `TiemposFine-Light.woff2` at `weight: "300"`. Thirteen call sites apply `font-display font-bold`. Verified on the tiers page: `h1` computes to `font-family: tiemposFine; font-weight: 700; font-size: 48px`. With no 700 face available the browser **synthesises** the bold — algorithmically smearing the letterforms of a licensed display face.

**Why it feels unintentional:** faux bold is never a decision. It is what happens when a Tailwind weight utility is applied to a single-weight custom face. On a 48px headline the distortion is plainly visible.

**CHRP/app-reference mismatch:** Direct violation of the brand guideline — *"Headlines: Tiempos Fine, Sentence case, 110% line height, 0% tracking, **one weight**."* The whole point of Tiempos Fine Light is its drawn weight.

**Recommended correction:** REMOVE

**Exact implementation scope:** Delete `font-bold` from the 13 `font-display font-bold` occurrences in `src/components/scan/TierPicker.tsx`, `src/components/dashboard/Dashboard.tsx`, `src/components/stages/CreatorProfileStage.tsx`. Pure subtraction — no replacement weight, no new font file.

**Regression risk:** Low

---

### 7 — The catalog purchase surface is a four-column grid holding one card

**Classification:** Hard Slop
**Severity:** High
**Surface:** `/scan/[id]/tiers` · `TierPicker.tsx`
**Viewport(s):** 1440 (and 768)

**What is happening:**
`TierPicker.tsx:38` defines `ORDER = ["artist_catalog"]` — one product. `TierPicker.tsx:59` lays it out as `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`. Measured at 1440: `grid-template-columns: 243px 243px 243px 243px`, grid width 1020px, **one** 243px card, **729px of empty columns** to its right. The lone $149 offer is a narrow card stranded at the left of a 1100px container.

Surrounding chrome is scaffolding for a comparison that no longer exists: eyebrow "Choose a catalog tier", the card's inner CTA reading "Choose", a live `MOST_POPULAR` branch that only alters a border colour because the single tier is trivially the popular one, and a `comingSoon` badge path with nothing to badge. The card also uses Tailwind's default `rounded` — measured **4px**, matching no CHRP token (10 / 16 / 20 / 999).

**Why it feels unintentional:** a chooser with one option, sized for four. This is the clearest template artifact in the product — UI that outlived its content.

**CHRP/app-reference mismatch:** Confident restraint and generous negative space, versus 729px of *accidental* emptiness. Off-token radius breaks the geometry language.

**Recommended correction:** SIMPLIFY

**Exact implementation scope:** `src/components/scan/TierPicker.tsx` — drop `lg:grid-cols-4` (and `md:grid-cols-2`) so the single offer is sized deliberately; remove the dead `MOST_POPULAR` branch; replace `rounded` with the card token. **Commerce untouched** — same product, same $149, same route to `checkout-tier`. This is layout only; it is not a pricing or packaging recommendation.

**Regression risk:** Low

---

### 8 — A second serif appears once, at the report's closing moment

**Classification:** Soft Slop
**Severity:** Medium
**Surface:** `ReportOwnership.tsx` · `.rp-own-title` inside the report
**Viewport(s):** All

**What is happening:**
Font-family census of the rendered paid report: **Cormorant ×26, Lato ×56, Tiempos Fine ×1**. The single Tiempos node is `.rp-own-title` — "Your Song Intelligence is ready." at 32px — sitting inside a document whose title, signature, Rhodes reading, placement headings and every score are Cormorant.

**Why it feels unintentional:** it is a visible seam. The ownership module was built in the marketing type system and dropped into an editorial document, so the report's final and most emotional heading is the one heading in a different serif. Two serifs, 32px apart in the same column, reading as one voice interrupted.

**CHRP/app-reference mismatch:** The brand README names the report as *the* place to reserve Tiempos — *"reserve Tiempos for the one premium-intelligence moment per surface (e.g. the report)."* The product does the inverse: Cormorant carries the intelligence, Tiempos appears once, at the hand-off. Whichever face wins, the document should hold one serif.

**Recommended correction:** ALIGN

**Exact implementation scope:** `src/components/report/ReportOwnership.tsx` — bind `.rp-own-title` to the report's display face so the closing heading matches the document it closes. One class/token change. (The broader Cormorant-vs-Tiempos question for the whole report is a brand decision, not a defect — see Product-Language Audit. Do not reopen it as part of this fix.)

**Regression risk:** Low

---

### 9 — The uppercase label system has six sizes and eleven colours

**Classification:** Soft Slop
**Severity:** Medium
**Surface:** Landing page — all eyebrows, kickers and micro-labels
**Viewport(s):** All

**What is happening:**
26 uppercase micro-labels on the landing. Measured spread:

- **Sizes:** 8.96, 10.24, 10.56, 11.2, 11.52, 12.48 px — six values
- **Colours:** eleven distinct, including seven different opacities of the same two inks — `0.45, 0.55, 0.6, 0.62, 0.68, 0.7, 0.72`

Sharpest example: inside one section (`THE DIFFERENCE`), two sibling labels render at `11.52px / 0.68` and `11.2px / 0.62` — differing by 0.32px and 0.06 opacity.

Two of these also fall below contrast on cream: `01` movement numbers at **3.05:1** and `FLOW MODE` at **4.18:1** (4.5 required).

**Why it feels unintentional:** no designer picks 0.62 for one label and 0.68 for its neighbour. These are per-component decisions accumulated over time, and the sub-pixel near-misses are the tell. The result is that 26 labels compete at the same volume without ranking anything.

**CHRP/app-reference mismatch:** The eyebrow is a system element in the app — one size, one colour, one job. Eleven variants is not restraint.

**Recommended correction:** SIMPLIFY

**Exact implementation scope:** `src/app/globals.css` — collapse to two label tiers (section eyebrow / in-card kicker), two sizes, two colours, and lift the two failing values to ≥4.5:1. Everything already keys off `.eyebrow`-family classes, so this is a token consolidation, not a markup change.

**Regression risk:** Low

---

### 10 — The same sentence is the transition and the headline it transitions into

**Classification:** Copy-Presentation Slop
**Severity:** Medium
**Surface:** Free reveal → boundary, `ScanPreview.tsx` · `.rv-inner`
**Viewport(s):** All

**What is happening:**
Two elements, 236px apart, in the same container:

- `<p class="rv-transition">` — Tiempos 30.4px: *"That tells you what the song is doing. The full report tells you what to do with it."*
- `<h2>` — Tiempos 54.4px: *"The full report tells you what to do with it."*

Same font, same colour, same words. The heading restates the second half of the line immediately above it, at 1.8× the size.

**Why it feels unintentional:** it reads as generated — a transition and a headline written for the same slot, both shipped. It is the one place in the flow where the product repeats itself verbatim, and it sits at the highest-stakes moment: the boundary before payment.

**CHRP/app-reference mismatch:** Confident restraint. CHRP says a thing once.

**Recommended correction:** REMOVE

**Exact implementation scope:** `src/components/scan/ScanPreview.tsx` — drop the duplicated clause from `.rv-transition` so it ends at *"That tells you what the song is doing."* and the `<h2>` lands as the answer. No new words are written; nothing is rephrased.

**Flag:** this deletes words, so it needs the copy owner's nod even though it is a presentation fix. It is listed because the brief explicitly asks for duplicate headings.

**Regression risk:** Low

---

## REPORT HIERARCHY AUDIT

**Is the progression immediately understandable? Partially — the content sequence is right; the visual hierarchy does not express it.**

Rendered order and what each currently achieves:

| # | Section | Intended job | Achieved? |
|---|---|---|---|
| — | Hero: title 64px, radar 200px, mode pill | **MEASUREMENT** establishes the signal | **No.** The instrument is dwarfed by the title; labels render at 4.4–5.9px. |
| 01 | Emotional signature | Measurement → meaning | Yes. 26px Cormorant, well weighted. |
| — | The CHRP reading (Rhodes) | **MEANING** — human understanding | Yes, in prose. But indented 27px off the header column, and announced by the same 10px label as everything else. |
| 02 | EPI profile | **MEASUREMENT**, in full | Weakly. Scores render at 18px — smaller than a placement heading. |
| 03 | Where this could live | **COMMERCIAL APPLICATION** — opportunity | Yes. Placement titles at 20px are the strongest sub-heading in the document. |
| 04 | Who to put it in front of | Targeting | Yes. |
| 05 | Pitch throughline | Immediate utility | Yes — the pull-quote treatment is the one genuine change of register in the report. |
| 06 | Who responds, and when | Human-market understanding | Yes, but see ordering note. |
| 07 | Worth considering | **ACTION** | **No.** Presented identically to every preceding section, so the report ends without a change in altitude. |

**Two structural observations**

1. **Measurement is the visually weakest thing in a measurement product.** The EPI score (28.1px effective) and the four dimension scores (18px) are both smaller than the song title (64px) and the placement headings (20px). The document currently reads meaning-first.
2. **Audience (06) lands after Pitch (05).** The brief's stated progression puts human-market understanding before the pitch language it justifies. As shipped, the creator receives the paste-ready deliverable, then is returned to understanding, then to action. *This is an ordering observation, not a recommended change* — reordering sections is structural and carries regression risk that a cosmetic audit should not authorise. Flagged for the product owner's call.

**Minimum cosmetic corrections required**

1. Enlarge the EPI instrument at `md`+ so its labels clear ~11px (Finding 3). Single prop.
2. Differentiate three header altitudes — measurement / application / action (Finding 2). No new elements; drop the italic sub-label on the quieter movements.
3. Raise the `02 · EPI PROFILE` score type so the numbers outweigh the placement headings.
4. Snap body prose to the header column and one measure (Finding 4).
5. Unify the closing heading's serif with the document (Finding 8).

That is five presentational changes. None touch section content, order, or generation.

---

## RESPONSIVE AUDIT

Only findings actually measured.

### 390

- **Horizontal overflow: `scrollWidth` 472 vs 390 (+82px).** Sourced entirely to `.si-hero-atmos` and `.si-hero-horizon`. → Finding 5.
- **Sub-40px tap targets:** `My songs` nav link **17px** tall; footer `Privacy` / `Terms` / `Methodology` **20px**; report `↓ Download PDF` **17px** (82×17). All below the 44px minimum.
- Type scale holds: h1 43px, section h2s 34px. Line length 22–52 characters — good.
- Report: **no overflow**, line length 44–53, layout stacks correctly. Clean.
- Radar stays 200px — proportionally correct at this width. No change wanted here.

### 768

- **Horizontal overflow: `scrollWidth` 939 vs 762 (+177px)** — the worst of the three viewports, same two decorative layers. → Finding 5.
- **Pricing pair heights diverge:** `.si-tier` 377px vs `.si-tier-dark` 399px in the same row. Bottom edges do not align.
- Four `.si-dim` blocks correctly go full-width at 698px, sharing left edge 32. Clean.

### 1440

- **No horizontal overflow.** `scrollWidth` = `clientWidth` = 1434.
- **Pricing pair misaligns in three ways at once:** cards 425px vs 455px tall (30px); CTAs 536×52 vs 476×50 — different widths *and* heights; CTA bottom edges at 7973 vs 7971, a **2px** miss. The 2px comes from `.btn-ghost` carrying a 1px border with `height:auto`, so the border adds outside the 50px `.btn` box. Two adjacent buttons that should read as a pair are off in every dimension. **Correction: ALIGN** — reduce `.btn-ghost` vertical padding by 1px and match the two CTA widths. `src/app/globals.css`. Risk: Low.
- **Tier picker: 243px card in a 1020px four-column grid**, 729px empty. → Finding 7.
- **Report body: five left edges, nine right edges.** → Finding 4.
- **Report radar 200px in a 920px column.** → Finding 3.
- `.wrap` left edge consistent at 127 across all 11 landing sections. Clean.

---

## CHRP PRODUCT-LANGUAGE AUDIT

| Dimension | Verdict | Reason |
|---|---|---|
| **Typography** | **FIX** | Tiempos is faux-bolded in 13 places against a one-weight brand rule, and a second serif appears exactly once inside the report. |
| **Color** | **KEEP** | Core trio plus a disciplined secondary palette; mode tokens calibrated separately for dark and light. Genuinely systematic. |
| **Aura** | **FIX** | The treatment itself is exactly right; it simply has no boundary below 840px and escapes the viewport. Clip it, do not change it. |
| **Geometry** | **KEEP** | The radius token set exists and is obeyed — one value on the landing, three in the report, zero strays. The one exception is the tier card's off-token 4px. |
| **Spacing** | **KEEP** | 100.8px section rhythm with 115.2px for emphasis. One `.wrap` edge. This is the strongest thing in the product. |
| **Cards / surfaces** | **KEEP** | 73 report boxes, 4 borders, 4 tints. No card soup, no competing surfaces. Do not add any. |
| **Buttons** | **FIX** | Three different primary-CTA treatments coexist: nav pill (12.48px / 700 / uppercase / 16r), hero action (12.48px / 900 / uppercase / 0r, correctly clipped), body `.btn-y` (13.5px / 900 / sentence case / 16r). Plus the 52-vs-50px ghost mismatch. |
| **Inputs** | **KEEP** | Uniform: 16px radius, 55–64px tall, cream fill, gold focus ring. Consistent across scan, signin and hero. |
| **Navigation** | **FIX** | The illegible CTA (Finding 1). The dark-marketing / light-product-shell split is otherwise coherent and deliberate — keep it. |
| **Yellow usage** | **FIX** | `globals.css:16` states the rule: *"#E6D74F (signal) only on primary CTA / EPI number / Ready chip."* The five `.btn-y` uses honour it. The **750px full-bleed yellow section** does not, and it is the largest yellow field on the page — so the biggest yellow moment outranks every CTA it exists to support. No CTA sits on it, so nothing is illegible; the cost is signal dilution. Make it a documented exception or reduce it. |
| **Editorial rhythm** | **FIX** | Nine right edges in the report; six label sizes and eleven label colours on the landing. |
| **Density** | **KEEP** | Line length 44–78 characters everywhere; no cramping, no dead air except where flagged. |
| **Premium feel** | **FIX** | Undercut by exactly four things: the 1.28:1 CTA, faux bold, the 4-column-one-card grid, and a report whose measurement is its smallest element. Fix those four and this reads premium. |

**Where it feels most like CHRP:** the landing hero, the report's restraint, the mode system, the spacing rhythm.
**Where it stops feeling like CHRP:** the tier picker (template residue), the nav CTA (broken signal), and the report hero (measurement demoted).

---

## AI-SLOP CHECK

Present and named:

1. **A chooser with one option, sized for four.** `lg:grid-cols-4` rendering a single card, with "Choose a catalog tier", a "Choose" button, a live `MOST_POPULAR` branch and a `comingSoon` badge path — all scaffolding for content that does not exist. The clearest generated-UI residue in the product.
2. **Seven identical section headers.** Repetition standing in for hierarchy. The report's altitude never changes, which is what makes a genuinely well-written document read as generated cards.
3. **Eleven opacities for one job.** `0.45 / 0.55 / 0.6 / 0.62 / 0.68 / 0.7 / 0.72` across 26 labels — including two siblings differing by 0.06. Accumulated per-component decisions, not a system.
4. **A sentence used twice, 236px apart, at 30px then 54px.** The transition and the headline it transitions into.
5. **`/scan` states one instruction three times** in a single 200px band: `<h1>` "Search a song or artist." → eyebrow label "SONG TITLE OR ARTIST" → placeholder "Search a song or artist…". The eyebrow adds nothing the heading and placeholder have not already said, and it renders gold-on-cream at **2.53:1**. Correction: REMOVE the eyebrow.
6. **`/signin` offers the same escape hatch twice** — "New to CHRP? Start with a free scan →" in the header and "Not a customer yet? Scan a track" in the footer of a short page.
7. **Synthetic bold on a licensed display face.** Nobody chooses faux bold; it is what a weight utility does to a single-cut font.

Explicitly **not** present, having looked for them: gratuitous gradients, glassmorphism, pill abuse, card soup, everything-centered, decorative UI without information value, AI-gradient cliché. The product is not over-decorated. Its slop is under-differentiation and unfinished edges — the opposite failure, and a much cheaper one to fix.

---

## DELETE LIST

Remove outright. No redesign, no replacement.

1. `font-bold` from the 13 `font-display font-bold` occurrences — `TierPicker.tsx`, `Dashboard.tsx`, `CreatorProfileStage.tsx`.
2. `lg:grid-cols-4` and `md:grid-cols-2` on the tier grid — `TierPicker.tsx:59`.
3. The `MOST_POPULAR` constant and the `popular` ternary — `TierPicker.tsx:40, 62, 72–77`. Dead branch on a one-item list.
4. The eyebrow label `SONG TITLE OR ARTIST` — `/scan`. The `<h1>` and the placeholder already say it, and it fails contrast.
5. The duplicated clause *"The full report tells you what to do with it."* from `.rv-transition` — `ScanPreview.tsx`. Keep the `<h2>`. *(Copy-owner sign-off.)*
6. The second free-scan invitation on `/signin` — keep one, drop the other.
7. The lowercase italic sub-label on the quieter report movements (`06`, `07`) — the least informative element in the report's header system.
8. Four of the six uppercase label sizes and nine of the eleven label colours — collapse to two tiers.

Nothing in the report body, no section, no card, no border, and no CTA appears on this list. The report's restraint is an asset.

---

## DO-NOT-TOUCH LIST

Preserve these exactly. Any future implementation that erodes one is a regression.

1. **The 100.8 / 115.2px section rhythm** and the single `.wrap` left edge.
2. **The radius token set** (`--r-pill / --r-btn / --r-input / --r-card / --r-sm`) and the discipline of using only those values.
3. **The report's surface restraint** — 4 borders and 4 tints in 73 boxes. Do not add cards, panels, dividers or containers to create the hierarchy called for in Finding 2. Hierarchy comes from type and space.
4. **The hero aura and treated portrait.** Clip it; do not restyle, recolour, or reduce it.
5. **The dark-marketing / light-product-shell split**, including the logo `invert(1) brightness(0)` treatment on the cream nav. Deliberate and correct.
6. **The mode colour system** and its separate dark/light calibrations.
7. **`.si-search-row`'s clipped action** — 16px radius parent with `overflow:hidden` and a square child. Correct pattern; leave it.
8. **The cream + serif editorial register of the report.** It is what makes the deliverable feel like a document rather than a dashboard.
9. **Report line length** (44–53 at 390, ≤78 at 1440).
10. **The pull-quote treatment on `05 · PITCH THROUGHLINE`** — the one genuine change of register in the document, and the model for how the other altitudes should be differentiated.
11. **All five `.btn-y` primary CTAs at their current yellow.** The signal rule is honoured here; only the full-bleed band is in question.
12. **The report's section content, order, and every generated string.** Untouched by every recommendation above.

---

## SURGICAL IMPLEMENTATION PLAN

Ordered by value per unit of risk. Every item is CSS or a presentational prop. No engine, entitlement, commerce, routing, data or copy-generation change. No code written here.

| # | File / component | Exact visual issue | Exact correction | Why | Risk |
|---|---|---|---|---|---|
| 1 | `src/app/globals.css` — `.si-nav-cta` vs `.si-nav nav a` | Primary header CTA computes to `rgba(251,251,244,.7)` on `#E6D74F` = **1.28:1**, weight 700 not 900 | Raise the CTA rule's specificity above `.si-nav nav a` so the authored `color: var(--ink)` / `font-weight: 900` apply | Restores the site's primary conversion control and the brand's yellow signal | Low |
| 2 | `src/app/globals.css` — `.si-hero` | +82px (390) / +177px (768) unclipped overflow from `.si-hero-atmos` / `.si-hero-horizon` | Add `overflow-x: clip` to `.si-hero` | Bounds the aura at mobile and tablet; 1440 unchanged | Low |
| 3 | `TierPicker.tsx`, `Dashboard.tsx`, `CreatorProfileStage.tsx` | Faux bold on single-cut Tiempos Fine, 13 sites | Delete `font-bold` from `font-display font-bold` | Ends synthetic emboldening of a licensed brand face; honours the one-weight rule | Low |
| 4 | `src/components/ReportPage.tsx:222–228` | Radar `size={200}` in a `md:w-[220px]` aside → 4.4px and 5.9px effective labels beside a 64px title | Raise the aside width and `size` at `md`+ (~320–360) so labels clear ~11px; leave 390 as-is | Makes the EPI instrument establish the signal, as the file's own header comment intends | Low |
| 5 | `src/components/scan/TierPicker.tsx` | One 243px card in a 1020px four-column grid; 729px dead space; off-token 4px radius | Drop `lg:grid-cols-4` / `md:grid-cols-2`; remove the dead `MOST_POPULAR` branch; use the card radius token | Removes the most obvious template artifact from a purchase surface. Product, price and route unchanged | Low |
| 6 | `src/components/ReportPage.tsx` | All 7 movement headers identical (Lato 10/700/#4A4540 + Cormorant italic 12/#4A4540) | Establish three header altitudes — measurement / application / action — using size and space only; drop the italic sub-label on `06` and `07`; raise `02` score type above placement headings | Makes MEASUREMENT → MEANING → APPLICATION → ACTION legible without adding a single element | Low |
| 7 | `src/components/ReportPage.tsx` | Body prose at left 313 / 340 / 348 / 353; right edges spanning 701–1121 | Snap Rhodes, placement and ownership prose to the header column; settle on one measure (~520px) | One column makes the document read as designed rather than assembled | Low |
| 8 | `src/components/report/ReportOwnership.tsx` — `.rp-own-title` | The only Tiempos node in a 26-node Cormorant document | Bind the closing heading to the report's display face | Removes a visible typographic seam at the report's most emotional moment | Low |
| 9 | `src/app/globals.css` — `.btn-ghost`, `.si-tier` | Pricing pair: cards 425 vs 455; CTAs 536×52 vs 476×50; bottoms 2px apart | Reduce `.btn-ghost` vertical padding by 1px to absorb its border; match the two CTA widths | Two adjacent buttons stop reading as a near-miss | Low |
| 10 | `src/app/globals.css` — label/eyebrow family | 6 sizes, 11 colours, 7 opacities for one job; two values below 4.5:1 | Collapse to two tiers (section eyebrow / in-card kicker), two sizes, two colours; lift the failing values | Turns 26 competing labels into a system | Low |
| 11 | `/scan` (`ScanInput.tsx`), `/signin` (`SignInForm.tsx`) | `/scan` states one instruction three times, the eyebrow at 2.53:1; `/signin` offers the free scan twice | Remove the `SONG TITLE OR ARTIST` eyebrow; keep one free-scan invitation | Subtraction only; the heading and placeholder already carry the instruction | Low |
| 12 | `src/components/scan/ScanPreview.tsx` — `.rv-transition` | Same sentence at 30.4px then 54.4px, 236px apart | Drop the duplicated clause from the transition; keep the `<h2>` | Removes the one verbatim repetition in the flow, at the pre-payment moment | Low — **copy-owner sign-off required** |
| 13 | `SiteHeader.tsx` nav, footer links, report `↓ Download PDF` | Tap targets at 17px and 20px against a 44px minimum | Raise the hit area via padding; leave the visual size alone | Mobile reachability without any visual change | Low |
| 14 | `src/app/globals.css` — `.si-yellow` | 750px full-bleed yellow band contradicts the file's own stated signal-only rule | **Owner decision:** ratify it as a documented exception, or reduce it so the CTAs remain the loudest yellow | Protects yellow as a signal. Listed last because it is a judgement call, not a defect | Low |

**Sequence note:** items 1–5 are unambiguous defect repairs and can ship together. Items 6–8 are the report hierarchy pass and should ship as one change so the document is judged whole. Items 9–13 are cleanup. Item 14 needs a decision before any work.

Items 1–8 alone move the product from **7** to roughly **9**. Items 9–13 take it to **9.5+**.

---

## FINAL VERDICT

**ANTI-SLOP AUDIT COMPLETE — SURGICAL FIXES RECOMMENDED**
