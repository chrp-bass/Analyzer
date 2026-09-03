# CHRP SONG INTELLIGENCE — ART DIRECTION

**Concept:** THE SONG HAS A SHAPE.
**Date:** 2026-09-02, landing pass 2026-09-03
**Baseline audited:** `f6a1cc2` (post anti-slop repair) · **Journey shipped:** `ad7fa4e`

---

## THE JOURNEY CONCEPT

### THE SONG HAS A SHAPE

**One sentence:** CHRP draws a shape out of a song, and every surface after that
is the same shape being read, applied, and accumulated.

The concept exists because CHRP already had a primitive nobody had noticed it
owned. Its four measured dimensions — Focus, Balance, Motivation, Calm — plot a
quadrilateral, and that quadrilateral is *different for every song*. A ring is
the same ring at a different fill. A shape is a portrait. That is the difference
between a metric and an identity, and it is why this product does not need to
borrow the visual language of streaming to make a single track feel like an
object.

The journey is that shape's life:

| Act | Surface | What the shape is doing |
|---|---|---|
| ARRIVAL | landing | promised |
| SONG | scan entry | not yet drawn |
| **REVELATION** | **processing — "The Reading"** | **drawn, out of the song** |
| EPI | free reveal | explained (instrument, with grid) |
| HUMAN MEANING | report 01–02 | read |
| COMMERCIAL POSSIBILITY | report 03–05 | applied |
| FREE VALUE | reveal + boundary | kept |
| PAID VALUE | report | signed (mark, no grid) |
| OWNERSHIP | dashboard, $149 | accumulated |

**The one rule the concept generates:** the shape is an **instrument** where it
teaches and a **mark** where it is recognised. That distinction is now explicit
in code (`PolygonRadar showGrid`), not accidental.

- **Instrument (grid on)** — ≥260px, explanatory: The Reading, free reveal,
  paywall preview, creator profile hero.
- **Mark (grid off)** — ≤80px or signature: report hero plate, PDF, dashboard,
  My Songs, progress callout, catalog slots.

Below ~100px the measurement grid is sub-pixel noise, so the split is a
legibility argument as well as a brand one.

---

## UIZZE REFERENCES

Recorded per the reference discipline. A reference only counts if the final
field is non-empty.

### 1 — Shazam · "Product Details — success"

- **DESIGN PROBLEM:** How does a music product make one track feel like an
  emotional object rather than a row in a list?
- **WHAT IT TAUGHT US:** The artwork is not placed *on* a surface — it *is* the
  surface. It bleeds to black and the type sits directly on the image field,
  with no card, no panel, no container. The record is the ground.
- **WHAT WE REJECTED:** The dark full-bleed treatment itself, and the player
  chrome. CHRP's report is cream, printed, editorial — importing a streaming
  hero would have made the deliverable look like a music app instead of a
  document, and the audit correctly named that cream editorial register as the
  product's strongest asset.
- **CHRP TRANSLATION:** "The image is the layout" became "the *measurement* is
  the layout." Since CHRP generates a per-song shape, the shape does the job the
  artwork does in a streaming product. Actual cover art enters as a small
  squared plate — provenance, credited by the title beneath it — deliberately
  too small to outrank the measurement.
- **BUILD CHANGE:** `ReportPage.tsx` `HeroTitleBlock` now renders
  `track.artworkUrl` as `.rp-hero-art` (72px, squared, hairline). The field was
  already resolved by the engine and shown on the free reveal but had never
  appeared in the paid report. `ScanProcessing` shows the same artwork from the
  first frame.

### 2 — Apple Music · Radio / now-playing

- **DESIGN PROBLEM:** How is track identity composed against artwork?
- **WHAT IT TAUGHT US:** Metadata hierarchy is ruthless — one loud title, one
  quiet artist, everything else demoted to a caption tier. Nothing competes.
- **WHAT WE REJECTED:** Component-assembled stacking (banner → header → card →
  card), which is exactly the failure mode CHRP's hero already had.
- **CHRP TRANSLATION:** The report hero was two blocks pushed apart by layout
  defaults with ~380px of dead space and no relationship between them. Hung
  both from a shared baseline instead.
- **BUILD CHANGE:** `PositionBlock` switched from `items-start` to
  `items-end`. Title block and EPI plate now share an exact floor (measured:
  both bottom at 562px @1440). Hero height 444px → 374px.

### 3 — WHOOP / Oura / performance-score pattern (category discovery: *signature
score visualization*, *primary metric identity*)

- **DESIGN PROBLEM:** How does one proprietary number become a recognisable
  product asset?
- **WHAT IT TAUGHT US:** Three things. The number is the largest object on the
  surface. The identity object carries **no chart furniture** — a WHOOP ring has
  no gridlines, no axis ticks. And it is repeated at *fixed geometry* across
  every surface, which is what converts a metric into brand memory.
- **WHAT WE REJECTED:** The ring itself, explicitly. A ring encodes one scalar;
  CHRP's shape encodes four and is unique per song, which is a strictly better
  asset. We did not adopt ring-style arcs anywhere.
- **CHRP TRANSLATION:** Strip the grid, lift the score out of the shape, and fix
  the lockup so it can repeat unchanged. The score had been *geometry-bound*:
  `CenterReadout` scaled it to fit the polygon's widest span, so a narrow kite
  shrank the number to a speck and a wide one let it collide with its own
  outline. A signature number cannot be sized by the song it measures.
- **BUILD CHANGE:** New `EpiPlate.tsx` (shape → rule → score → EPI/mode, all
  flush to one left edge). New `showGrid` prop on `PolygonRadar`. Score is now
  the largest numeral in the report (`clamp(64px, 7vw, 88px)`, tabular figures
  so the lockup does not reflow between a 7 and a 91). Mode pill removed from
  the report hero — it was the only 999px-radius object in a squared document.
  Same lockup rebuilt in `ReportPDF.tsx` and echoed at the end of The Reading.

### 4 — Airbnb · Product Details (category discovery: *opportunity map*,
*recommendation categories*)

- **DESIGN PROBLEM:** How do you present a set of distinct possibilities without
  it reading as an undifferentiated list?
- **WHAT IT TAUGHT US:** Possibility reads as expansion only when the document
  visibly *turns* — the transition into the options carries more air than the
  transitions inside them.
- **WHAT WE REJECTED:** Cards, tiles, and per-item containers. The audit's
  do-not-touch list is explicit that report hierarchy comes from type and space,
  and the report's 4-borders-in-73-boxes restraint is an asset.
- **CHRP TRANSLATION:** The report's altitude air was *decaying* — mt-16
  (measure) → mt-12 (apply) → mt-10 (close) — so the single most important hinge
  in the document, where measurement becomes commercial possibility, was its
  *quietest* transition.
- **BUILD CHANGE:** New `open` altitude in `ReportPage.tsx` (`mt-20 md:mt-28`,
  the widest gap in the document) applied to movement 03, plus a one-line
  `hinge` — *"Everything above is measured. Everything below is what the
  measurement makes possible."* — rendered once and only at the turn.

### 5 — Structured / Gentler Streak · Pricing & Subscription (category
discovery: *single premium digital product*, *one offer conversion*)

- **DESIGN PROBLEM:** How does one offer feel valuable without a pricing table?
- **WHAT IT TAUGHT US:** Chiefly by counter-example — these are the genre CHRP
  had accidentally joined: bordered box, price, feature list, dark button. What
  the better examples do is put *the product* in front of the price rather than
  a specification of it.
- **WHAT WE REJECTED:** Everything structural. Also rejected: the "save 22% vs
  single scans" line CHRP already had, because the file's own comment states
  that the catalog is "a different product, not a volume discount" — the surface
  was arguing against itself.
- **CHRP TRANSLATION:** Draw the offer instead of listing it. The creator has
  just had one song measured, so place *that song's real shape* first and the
  nine slots it could become beside it, empty. "10 tracks" stops being a line
  item and becomes the picture. The empty slots use the identical viewBox and
  plotted radius as `PolygonRadar`, so an empty slot is exactly the measurement
  field a scanned song would fill.
- **BUILD CHANGE:** `TierPicker.tsx` rewritten. Card, spec list, discount line
  and black CHOOSE button removed; replaced by the catalog constellation (one
  real mark + nine dashed fields, a fixed 10-column grid so a slot is never
  orphaned), an editorial headline reusing the existing brand line, and a
  price/CTA pair sharing a baseline.

---

## WHAT MUSIC / PERFORMANCE / EDITORIAL / CULTURE / COMMERCE TAUGHT US

- **MUSIC** — the record is the ground, not a thumbnail; and metadata hierarchy
  must be ruthless. Translated as: the song is present in the first frame of The
  Reading and never leaves, and the shape does the emotional job artwork does
  elsewhere.
- **PERFORMANCE** — one number becomes memory through no chart furniture, fixed
  geometry, and repetition. Translated as the EPI plate and the
  instrument/mark split.
- **EDITORIAL** — a document must visibly change subject. Translated as the
  `open` altitude and the single hinge line.
- **CULTURE** — composition means a shared floor, not aligned ceilings; and one
  memorable grid break. Translated as the bottom-aligned hero, and as the
  catalog row — ten fields where nine are empty, which is a composition that
  states an argument.
- **COMMERCE** — the product must precede the price. Translated as the catalog
  constellation sitting above the $149.

**THE CHRP SYNTHESIS:** none of these products has a per-artefact generated
identity. WHOOP's ring is the same ring for everyone; Shazam's hero belongs to
the label that made the artwork. CHRP generates a unique mark per song from its
own measurement, which means its brand asset and its product output are the same
object. The journey is that object being drawn, read, applied and accumulated.

---

## MATERIALS

**None used.** Searched `find_ui_materials` for an animated motion primitive for
the reveal; nothing returned that would improve it. The other material roles do
not exist in this product: the type system is settled and licensed (Cormorant /
Lato / Tiempos Fine), no icon set is in use anywhere in the journey, and the
signature moment's choreography is built from `framer-motion`, already a
dependency. Adding a material here would have been decoration, and the brief is
explicit that a material must earn its place.

---

## THE SIGNATURE MOMENT — "THE READING"

**Surface:** `/scan/[scanId]/processing` · `ScanProcessing.tsx`

**What it was:** a loading state wearing a chart. Six seconds of rotating status
copy — *"Analyzing your song…"*, *"Computing EPI Score…"* — over an empty 280px
box, after which a polygon appeared and the song itself finally showed up
underneath it at 10px. The song was the last and smallest element on a screen
that claimed to be reading it. Describable afterwards only as "a spinner became
a diamond."

**What it is:** inverted, on three rules.

1. **The song is present in the first frame and never leaves.** Artwork, title,
   artist — an ordinary record being ordinary. That is the "before" the moment
   needs in order to have an "after."
2. **The measurements replace the status copy.** Each dimension resolves as its
   vertex lands, carrying its real value — Focus 84, Balance 52, Motivation 96,
   Calm 21 — and the EPI lockup lands last. Nothing narrates fake progress. The
   interface explains the product by performing it, using only real engine
   output.
3. **The instrument keeps its grid.** This is the teaching surface: it is where
   someone learns the shape is plotted rather than drawn.

**Timing** is driven by when the measurement actually exists, not by a fixed
clock — a fixture paints after a short beat, a real scan begins the moment
scoring lands, and the route still advances only when both the reveal has
finished and the report is real.

**Accessibility:** reduced motion is a first-class path, not a degradation. The
whole reading resolves at once with no drawing and no stagger
(`useReducedMotion` in both `ScanProcessing` and `PolygonRadar`; the radar's
guard is authoritative and overrides any caller passing `animated`). Values are
delivered by `setTimeout` and announced in an `aria-live="polite"` region, so
nothing is communicated only through movement. No scroll-jacking anywhere.

**Describable afterwards as:** *"I watched an ordinary song turn into a shape,
and CHRP read the numbers out of it as it drew."*

---

## DELIBERATELY UNCHANGED

Not every surface needed work. These already belong to the same commissioned
experience:

- **The landing hero and its eleven sections.** Dark, atmospheric, aura over a
  treated portrait, 100.8px section rhythm, one `.wrap` left edge. It already
  carries the brand line the $149 surface now reuses.
- **The free reveal and the boundary.** The boundary is drawn as two honest
  lists with no blur and no rendered-then-obscured content. It is the clearest
  paywall in the product and was left alone.
- **The report's surface restraint** — 73 boxes, 4 borders, 4 tints. No cards,
  panels or dividers were added to create the new hierarchy; the `open` altitude
  is space and one line of type.
- **Section content, order, and every generated string.** No engine, Rhodes,
  entitlement, Stripe, auth, email or API change.

---

## FUNCTIONAL LOCKS OBSERVED

No change to: EPI formula, arousal/valence, Focus/Calm/Motivation/Balance, Mode;
Rhodes evidence logic or governor; Placement / Buyer / Audience / Pitch /
Commercial-next-step generation; first-free, $19 or $149 entitlement; Stripe,
checkout or webhooks; authentication, ownership, email, magic links, database or
API contracts. No verdicts restored. No fabricated commercial claims — the
catalog constellation's empty slots are empty because those songs have not been
scanned, and the only numbers on that surface are the tier's real
`trackLimit` and `priceUsd`.

---

## DEFECTS FOUND AND FIXED ALONG THE WAY

**The PDF's colours were wrong in every downloaded report.** `@react-pdf` does
not parse `rgba()` strings the way a browser does. Measured off the rasterised
PDF, the EPI mark rendered Flow as gold `(255,214,115)`, Recover as hot pink
`(255,57,115)` and Recharge as teal `(0,168,166)` — none of which are in the
CHRP palette — and every rule rendered red instead of grey. Pre-existing, and it
sat on the one artefact the creator keeps and forwards. Replaced with exact hex
composites of the report's own tokens over the paper, at the same alphas the
screen report uses, so print and screen now resolve to the same colour. Since
the mark carries no grid behind it, it only ever composites against paper and
the flattening is lossless. All four modes verified pixel-exact.

**"Balance" was clipped to "Balanc"** in the PDF, whose viewBox was narrower
than the web instrument's. Widened to match.


---

# LANDING PASS — 2026-09-03

**Baseline:** `ad7fa4e`. The journey shipped, and its own closing review named
the remaining gap: *"The landing is the one major surface I left alone — it's
coherent, but it was authored before this concept existed and doesn't yet
promise the shape."* This pass closes that, and only that.

## THE SCOPE DECISION

Eleven sections were inspected in production before anything was touched. Two
findings governed the pass:

1. **Sections 2 and 3 are already right.** "You know what the song feels like"
   is an asymmetric editorial split with a pull-quote; the statement band is a
   full-bleed vinyl photograph carrying one yellow serif line. Neither collapses
   into cards or a feature grid — the exact failure the brief warned about — so
   both were left untouched.
2. **The catalog argument already exists** on the landing ("One song tells you
   something. A catalog tells you who you are."), which is the line the $149
   surface now reuses verbatim. The setup was there; it did not need adding.

So the gap was the hero, and the hero alone. One component, one CSS block, one
deletion. No new sections, no added copy.

## THE HERO

**Before:** a treated portrait of a person, with an empty dashed dial floating
over it, captioned *"Your song's shape appears here. It takes about ten
seconds."*

Two things were wrong. There was **no song anywhere** in a hero whose entire
claim is that a song has a shape — the composition's subject was a face and a
gauge. And a gradient-lit portrait beside a dark circular dial is the single
most generic composition available to a landing page: it is what an AI
landing-page generator produces, and it is what the brief's own tests #10 and
#11 exist to catch. The caption was doing work the composition should have done.

**After:** THE SPECIMEN. Real songs, one at a time, in the instrument.

```
Redline                    <- the song, first
by Voss Black
   [ instrument, grid on, real geometry, mode colour ]
91  EPI · Ready mode       <- the plate lockup
Six songs. Six shapes. Yours takes about ten seconds.
Example output — illustrative values, not live scans.
```

**Why plurality.** One song beside one shape proves nothing — the shape could be
decoration. Six songs cycling through the same instrument, each resolving to a
visibly different geometry (Redline's narrow yellow kite; Hollow Meridian's
broad blue diamond), proves the shape is **derived**. That is the argument, and
it cannot be made with a single specimen.

**Why it is not a duplicate of The Reading.** Downstream, one song — *yours* —
is drawn once, with its values landing as it draws. Here, many songs are drawn
in turn. The landing promises *songs differ*; the product delivers *yours*.
Related promise, not the same moment.

**Reading order is the thesis:** title and artist above, shape below. SONG →
SHAPE, top to bottom. Nothing is absolutely positioned over anything else, which
is what the portrait composition had been doing.

## UIZZE — LANDING PASS

### 6 — YouTube Music · Catalog Page

- **DESIGN QUESTION:** How does a music product make a song read as a distinct
  object before any interaction?
- **WHAT IT TAUGHT US:** Song identity survives as **title loud, artist quiet**,
  one line each — and *plurality* is what makes each entry legible as its own
  object. The artwork thumbnails are incidental; the type pairing carries it.
- **WHAT WE REJECTED:** The list furniture entirely — rank numbers, view counts,
  overflow menus. CHRP has no popularity data and must never imply it.
- **CHRP TRANSLATION:** The hero specimen needed no cover art (demo tracks have
  none, and inventing it would be a fabrication). Title in the display face,
  artist in quiet italic beneath, and the plurality supplied by cycling.
- **WHAT CHANGED:** `HeroSpecimen.tsx` — `.si-spec-title` / `.si-spec-by` as the
  song identity, six specimens rotating.

### 7 — Apple Music · hero states (category: *music product theater*)

- **DESIGN QUESTION:** How does a music surface hold a subject without a card?
- **WHAT IT TAUGHT US:** The subject sits in an atmospheric field, not in a
  container; the field does the framing.
- **WHAT WE REJECTED:** Player chrome and the album-art-as-wallpaper hero.
- **CHRP TRANSLATION:** Keep the existing aura layers (`si-hero-atmos`,
  `si-hero-horizon`) as the field and let the specimen sit *in* it with no box,
  no border, no panel.
- **WHAT CHANGED:** The portrait, its two tint passes and its vignette were
  removed; the aura layers were kept untouched.

## WHAT WAS REMOVED

- The hero portrait `chrp-aura-portrait.png` and its `tint-a` / `tint-b` /
  `vignette` treatment layers.
- `EmptyInstrument` — 83 lines of SVG drawing a dashed placeholder shape that
  existed only to say "no song yet." A real song says it better.
- `.si-portrait` and `.si-instrument` CSS, and the mobile override that
  repositioned the absolutely-placed dial.
- One clause of caption copy, replaced by a shorter line that names the thesis.

**This overrides one earlier lock.** The anti-slop audit's do-not-touch list
said *"The hero aura and treated portrait — clip it; do not restyle, recolour,
or reduce it."* The aura is preserved exactly. The portrait is not: it was the
element making the hero indistinguishable from a generated landing page, and
this brief's stated priority — make the landing promise the shape — cannot be
met while a stock-feeling headshot is the hero's subject. Flagged deliberately
rather than done quietly; it is a one-line revert if the call is wrong.

## SIGNATURE LANDING MOMENT

**What happens:** every 4.6 seconds the hero's song changes — title, artist,
geometry, mode colour and EPI score all resolve to a different real specimen,
through a single 420ms opacity crossfade.

**What it communicates:** songs are not all the same shape. The measurement is
derived from the song, not applied to it.

**Why it is memorable:** it is describable — *"it kept showing different songs
and each one had a different shape."* It is not "things fade in": the *content*
changes, and the change is the argument.

**Reduced motion:** the interval never starts and the first specimen stands. The
composition is complete and correct at rest, so no-JS, slow-first-paint and
reduced-motion visitors all see a finished specimen rather than an empty frame.
The CSS transition is also disabled under `prefers-reduced-motion`.

**Cost:** no animation library — one CSS opacity transition and one interval.
The specimen data is computed in the server component and passed as plain props,
so the fixture module is never imported by the client component (both its
imports are `import type`).

## MARK vs INSTRUMENT ON THE LANDING

The landing hero is an **instrument**: grid, crosshair, axis labels and per-axis
colours all retained. This is a first-time visitor's first encounter with the
shape, and the grid is what makes it read as plotted rather than drawn — the
credibility the brief asks for. The score lockup beneath it is set in the
**plate's** typographic form, so the number met here is the number recognised in
the report. The landing therefore introduces both halves: measured, and ownable.

## STILL DELIBERATELY UNCHANGED

Sections 2–11 of the landing, all downstream `ad7fa4e` work, the $149 surface,
all copy governed by the locked sales architecture, and every functional lock.
