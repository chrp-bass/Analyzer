# CHRP Brand Assets — Central Reference

Single source of truth for every CHRP brand element. Any site, thread, or Claude Code
session pulls from here. No hunting.

**Canonical location:** `~/code/chrp/brand` (`/Users/jeffsmith/code/chrp/brand`).
This is the source. Each site either imports it relatively (e.g. `../brand/...` if sites
are siblings under `code/chrp/`) or copies `brand/` into its served `public/` directory at
build and references `/brand/...`. The origin thread for each site knows which it uses.

> Status legend: **[ready]** = in this folder now · **[gather]** = real file must be
> copied in from an existing site repo (run `GATHER-ASSETS.prompt.md` with Claude Code).

---

## Folder structure

```
/brand/
  README.md                 [ready]  this file — the index
  chrp-tokens.css           [ready]  CSS custom properties (drop-in)
  chrp-tokens.json          [ready]  same values as JSON
  /fonts/
    fonts.css               [ready]  @font-face + Lato import
    TiemposFine-Light.woff2 [ready]  converted from licensed OTF
    TiemposFine-Regular/Bold/Italic.woff2  [gather, optional — only if a design needs heavier than Light]
  /logo/
    chrp-logo.svg           [ready]  white mark, for dark backgrounds
    chrp-logo-black.svg     [from Figma]  for light backgrounds
    chrp-logo-yellow.svg    [from Figma]
    chrp-logo-gradient.svg  [from Figma]
    chrp-logotype.svg       [from Figma]  full wordmark, if distinct
    chrp-logo-stacked.svg   [from Figma]  stacked, for small sizes
  /icon/
    chrp-icon.png           [ready]  raster — replace with SVG when available
    chrp-bird.svg           [from Figma]  vector bird glyph (marquee, dividers)
    favicon.svg             [from Figma]
  /graphics/                [ready]  bursts, lower-thirds, textures from benchmark sites — reuse before recreate
  /chain/                   [ready]  screen plan + screen prompt + handoff prompt
```

## How to use

1. Import tokens once per site: `@import url("/brand/chrp-tokens.css");`
2. Reference colors and type as variables: `background:var(--chrp-black); color:var(--chrp-yellow); font-family:var(--chrp-font-headline);`
3. Reference the logo and bird by path, never as a text substitute or emoji:
   `<img src="/brand/logo/chrp-logo.svg" alt="CHRP">`

## Asset fallback rule

Reference the real asset in `~/code/chrp/brand` whenever it exists. If it is not there yet,
use a clearly labeled temporary placeholder that points at the canonical `/brand` path it
will use, and log it as a known gap. Never invent a new fake, recolor the wrong variant, or
ship a placeholder as final. When the real file lands in `/brand`, it is a one-line swap,
not a rebuild.

## Reuse before recreate

Before recommending or building any graphic — a color burst, lower-third, texture, divider,
or icon — check `/brand/graphics` first. If a match exists, pull it for cross-site
consistency rather than recreating it. Name the file used. Only build new when nothing fits.

---

## Color (from Brand Guidelines V1A)

**Core:** Yellow `#E6D74F` · Black `#0F0E0E` · White `#FBFBF4`
**Secondary:** Magenta `#C12C79` · French Blue `#406BD6` · Kelly Green `#008054` ·
Cinnamon `#D98068` · Blue Factor `#A1DBFF` · Plum `#591739` · Pistachio `#BEE2A8` · Oat `#F7F3EA`

Each secondary has a full 100–900 tint ramp in the guidelines. Not all encoded here to
avoid propagating OCR errors; ask and I'll add verified ramps to the token files.

**CHRP Yellow `#E6D74F` is the umbrella signal.** It must appear at the brand moments on
every surface (logo, EPI Score, primary CTA), even when a niche site runs its own tone elsewhere.

## Type (from Brand Guidelines V1A)

- Headlines: **Tiempos Fine**, Sentence case, 110% line height, 0% tracking, one weight. Never all caps.
- Subheads / body / buttons: **Lato**, body ~140% line height.
- Size relationships: subhead 25–50% of headline; body 40–50% of subhead.
- Tiempos Fine is a **licensed** commercial font — not bundled here. Source the `.woff2`
  files from the repo that already uses it and drop them in `/fonts/`. Lato is free (Google Fonts).
- **This is the main-site default, not a product-surface mandate.** On product/ancillary
  surfaces, type lives in the expressive zone (see Surface expression tiers). Lato Black (900)
  at scale is an on-brand impact voice — reach for it before reaching outside the kit.

## Surface expression tiers

Main sites (chrp.ai, mychrp) hold the type backbone strictly. Product/ancillary surfaces
(scan.chrp.ai and peers) stay recognizably CHRP through a small fixed core and are free —
encouraged — to be bold everywhere else.

- **Non-negotiable core (every surface):** real logo mark · the EPI Score system (score,
  four modes, score-as-data-viz) · CHRP Yellow present as a signal · the lexicon. If these
  read, it's CHRP.
- **Expressive zone (product surfaces, be bold):** typography, color saturation, motion,
  layout, texture. The edge usually comes from the kit itself — Lato Black at headline scale,
  the secondary palette saturated, the aura made active — not from leaving the brand.
- **Tie-back, not uniform:** reserve Tiempos for the one premium-intelligence moment per
  surface (e.g. the report), rather than every headline. A deliberate tie-back is required;
  uniformity is not.

**Edge floor.** A product surface must still feel cutting-edge and native to its audience.
Any change that reduces distinctiveness without a connector reason is wrong — re-anchor to
the brand, never strip the expressive layer to reach conformity.

## Logo and bird rules (from Brand Guidelines V1A)

- Colors allowed: CHRP Black, Yellow, White, or an approved gradient only.
- Over photography: white or black only.
- Never stretch, recolor type vs bird separately, outline, shadow, or restyle. Keep clearspace. Min 40px.
- The bird is part of the logomark and is the recurring motif. Use the real glyph —
  never an emoji, never a generic raven drawing.

## Gradients

Four approved families (green→blue, warm yellow→peach→lavender, blue→magenta→black,
yellow→magenta→deep blue). Encoded as a starting point in the token files; tune the exact
stops against the source swatches once gathered.

## Aura treatment

The emotional visual signature: a soft color-cloud built from the approved gradient
families. Carry it on niche surfaces abstractly (e.g. tuned background blobs) rather than
forcing lifestyle photography. One human aura photo is optional per surface.

## Lexicon

Tagline "Let music move you." Campaign lines "Find Your Frequency," "CHRP is your new edge,"
"The soundtrack of how you feel." Term is **EPI Score** (modes: Flow, Ready, Recharge,
Recover). Use "emotional intelligence," never "emotional insights."
