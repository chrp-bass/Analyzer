import "server-only";
import type { PaidSections } from "@/lib/fixtures/tracks";

/**
 * Paid Song Intelligence prose.
 *
 * `server-only` makes importing this from a client component a build error,
 * which is what keeps the paid product out of the public JavaScript bundle.
 * Nothing in this file may be referenced from a "use client" module.
 *
 * These are development fixtures. In production the paid sections are
 * generated per scan; see @/lib/rhodes. They exist here so the report path is
 * runnable without an ANTHROPIC_API_KEY in development.
 *
 * DO NOT READ THIS PROSE AS A STYLE REFERENCE. It predates the evidence
 * governor and would not survive it: it names instrumentation and structure
 * nobody measured ("the riff architecture escalates through volume and
 * layering"), asserts a population it was never shown ("rare conviction"),
 * and claims behaviour over time the engine has no axis for. Generated output
 * is audited by @/lib/rhodes/governor before it ships; this text is not, and
 * it never reaches a real creator — fixtureReportsPermitted() refuses it in
 * production. It is kept only so the render path runs offline.
 *
 * These entries also predate the `consider` field, which is why that field is
 * optional on PaidSections. A fixture with no sixth movement simply does not
 * render one.
 */

export const PAID_SECTIONS: Record<string, PaidSections> = {
  redline: {
    consider:
      "The distance between Motivation and Calm is the whole positioning question here. Put this where someone needs to settle and the profile works against you. Worth deciding whether you want it to meet people who are already keyed up, or to be the thing that gets them there — it does the second more readily than the first.",
    rhodes:
      "A Ready-mode track operating at the extreme end of the catalog. Motivation at its ceiling, Calm at its floor — there is no ambiguity about what this song is for. It is a launch sequence. Built for the ten seconds before everything changes. Lead exclusively with apex performance moments: esports broadcast opens, championship fight-night entrances, performance vehicle reveals. The riff architecture escalates through volume and layering rather than chord progression, which means it holds intensity across extended cuts without telegraphing its ceiling. Do not hand this to anything requiring nuance, emotional complexity, or descent. It does one thing, and does it with rare conviction.",
    signature:
      "A relentless launch sequence built for the apex moment. No ceiling. No descent.",
    placements: [
      {
        title: "Esports and gaming broadcast",
        body: "Multi-million-viewer broadcast opens, tournament-bracket reveals, championship walkout cues. The mechanical escalation mirrors the rituals of competitive performance without borrowing from them.",
      },
      {
        title: "Performance vehicle reveal",
        body: "Supercar and performance truck launches, race-circuit brand films, track-day campaign hero spots. Pairs with cinematography that worships speed without apologizing for it.",
      },
      {
        title: "Action sports documentary",
        body: "Big-wave surfing, freeride mountain biking, extreme sports documentary opens. The repetition structure works in extended cuts that need to build to a physical climax without a traditional musical peak.",
      },
    ],
    throughline:
      "A song that exists in the red. Built for the moments before ignition — competition, speed, consequence — where the music's only job is to make what's coming feel inevitable.",
    comparable:
      "Lives in the same extreme performance territory as The Prodigy's 'Invaders Must Die' for action-sport brand use, with Gesaffelstein's 'Pursuit' as its closest contemporary sibling in high-end automotive.",
    where_this_music_lives: {
      verticals: [
        { name: "Athletic + sport", pct: 94 },
        { name: "Action + trailer", pct: 86 },
        { name: "Brand + performance", pct: 78 },
        { name: "Drama + intimate", pct: 4 },
      ],
      confidence: "high",
      n_briefs: 211,
      sample_brief:
        "Global performance footwear brand · championship season launch film · high-intensity anthem RFP · active 21 days  //  in-house creative, high-six-figure budget",
    },
  },
  "sea-glass": {
    consider:
      "Balance leads, with Calm close behind it, and that pairing does more work than either value alone. Worth testing whether the moments you have in mind want evenness or want restfulness; those are different requests. The distinction is yours to settle before you place it.",
    rhodes:
      "A Recharge-mode track with exceptional structural balance. Balance and Calm both sit high — this is a song built to restore without sedating. It operates in the restorative register without crossing into recovery territory: present, warm, unhurried. Lead with wellness brand films, luxury travel, and milestone celebrations where the music is asked to hold a feeling rather than move one. The acoustic arrangement remains accessible across demographic ranges from twenty to seventy-five, which makes it commercially flexible in a way most Recharge tracks are not. Hold this back from athletic, action, and high-tempo contexts where its intimate scale will be crushed. It earns its placement by being the right temperature, not the loudest signal.",
    signature:
      "Warm, restorative, and structurally balanced. Holds a feeling without insisting on it.",
    placements: [
      {
        title: "Wellness and lifestyle brand films",
        body: "Meditation app campaigns, spa and hospitality brand films, organic beauty editorial. Works across static, video, and long-form without losing its center.",
      },
      {
        title: "Luxury travel and destination content",
        body: "Boutique hotel brand films, destination-wedding content, premium travel campaigns. The coastal acoustic texture makes geography feel earned rather than generic.",
      },
      {
        title: "Milestone and anniversary brand spots",
        body: "Family-legacy narrative films, corporate anniversary commemoratives, retirement and tribute montages. Accessible across generations while maintaining emotional specificity.",
      },
    ],
    throughline:
      "A song about returning to yourself. Built for the moments when the music's only job is to hold space — wellness campaigns, travel stories, and the quiet declarations of a life well lived.",
    comparable:
      "Lives in the same restorative territory as Ben Howard's 'Keep Your Head Up' for lifestyle brand use, with Novo Amor as its closest sound sibling in wellness and premium-travel sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Wellness + lifestyle", pct: 91 },
        { name: "Luxury + travel", pct: 82 },
        { name: "Wedding + milestone", pct: 74 },
        { name: "Athletic + sport", pct: 8 },
      ],
      confidence: "high",
      n_briefs: 167,
      sample_brief:
        "Premium wellness brand · mindfulness app brand film · restorative acoustic RFP · active 18 days  //  agency-side, mid-five-figure budget",
    },
  },
  "after-the-fire": {
    consider:
      "Calm leads while Motivation sits well below everything else, which points to staying rather than moving. If you aim this at a moment that needs someone to act, the profile is not on your side. Worth asking whether the scene you are picturing wants resolution or wants company.",
    rhodes:
      "A Recover-mode track operating in the upper register. Recovery and Rest both high, Motivation withdrawn to its lowest register — this song is built for the aftermath. Not grief exactly, but the long exhale after. Lead with third-act dramatic resolution, end-of-season memorial segments, and long-form brand films that have earned an emotional landing. The string-and-piano arrangement carries sufficient weight to work beneath dialogue and voiceover without competing. What makes this unusual within the Recover mode is the Balance score: it holds emotional complexity without becoming heavy or punishing. That makes it more commercially flexible than most deep-Recover tracks. Hold it back from sport, action, and product-launch contexts — its gravity will read as deflation in those placements.",
    signature:
      "A song that arrives after the hard part. Carries weight without punishment.",
    placements: [
      {
        title: "Prestige drama and season-close sequences",
        body: "Third-act resolution in prestige television, season-finale emotional closes, long-form character-arc payoffs. Works particularly well under dialogue where an orchestral score would overtell the moment.",
      },
      {
        title: "Memorial and tribute broadcast segments",
        body: "League-broadcast memorial segments, end-of-season tribute packages, awards-ceremony in-memoriam montages. The restraint is the virtue — it doesn't perform grief.",
      },
      {
        title: "Long-form brand films with earned emotional arcs",
        body: "Corporate legacy films, charitable-foundation impact campaigns, healthcare brand narratives. Pairs with cinematography that has built to its feeling rather than rushed it.",
      },
    ],
    throughline:
      "A song for after. Built for the emotional exhale — the tribute, the resolution, the long breath out after something real has happened. The music does not cry. It stands with you.",
    comparable:
      "Lives in the same emotional territory as Max Richter's 'On the Nature of Daylight' for prestige drama use, with Ólafur Arnalds as its closest contemporary sibling in memorial and cinematic sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Film + television", pct: 94 },
        { name: "Documentary + tribute", pct: 88 },
        { name: "Brand + emotional", pct: 64 },
        { name: "Athletic + sport", pct: 6 },
      ],
      confidence: "high",
      n_briefs: 143,
      sample_brief:
        "Major streaming platform · original series · emotional season-close cue · Recover-mode RFP · active 9 days  //  in-house music supervision, episodic budget",
    },
  },
  "copper-static": {
    consider:
      "Balance and Focus both sit well clear of Motivation, so this is centred and immersive at once rather than either on its own. Consider whether the use you have in mind needs evenness it can rely on or attention it can hold. This profile offers both, and it will not supply the push.",
    rhodes:
      "A Flow-mode track with unusually high structural balance and a refined sense of rhythmic self-possession. Balance and Flow both sit high — this song moves without rushing. It creates momentum through patience rather than propulsion. Lead with premium lifestyle brand films, tech product launches, and fashion editorial where the music is asked to carry cool without broadcasting it. The neo-soul arrangement sits outside genre clichés, extending its commercial range. The mid-range Motivation is intentional: this is not a performance anthem, it is ambient intelligence — it makes the room smarter without making it louder. Hold it back from athletic and action contexts where its subtle authority will read as passivity.",
    signature:
      "Moves without announcing itself. Built for the room that already knows.",
    placements: [
      {
        title: "Premium tech product launches",
        body: "Consumer electronics keynote films, software brand campaigns, AI and design tool editorial. The understated intelligence of the arrangement mirrors brands that don't need to explain themselves.",
      },
      {
        title: "Fashion editorial and lookbook content",
        body: "Designer collection films, high-fashion editorial, luxury retail brand campaigns. Works in both 30-second brand spots and longer editorial formats without losing its identity.",
      },
      {
        title: "Architecture and interior design content",
        body: "Residential architecture brand films, high-end interior design editorial, premium real estate campaigns. The spatial quality of the production makes room for visual breathing.",
      },
    ],
    throughline:
      "A song with something to say and no need to repeat itself. Built for the brand that earns attention rather than demands it — premium tech, fashion, and architecture content that moves through rooms without disturbing them.",
    comparable:
      "Lives in the same sophisticated territory as Hiatus Kaiyote for premium brand use, with Jorja Smith's catalog as its closest sound sibling in fashion and lifestyle sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Brand + lifestyle", pct: 88 },
        { name: "Fashion + retail", pct: 81 },
        { name: "Film + television", pct: 67 },
        { name: "Athletic + sport", pct: 14 },
      ],
      confidence: "high",
      n_briefs: 176,
      sample_brief:
        "Global tech company · consumer product launch film · sophisticated Flow-mode RFP · active 14 days  //  agency creative, premium budget tier",
    },
  },
  "white-heat": {
    consider:
      "Motivation leads and Calm trails by a wide margin, but Focus sits high enough that this is not drive alone. Worth testing whether the moment needs momentum or momentum with somewhere to point it — the profile supports the second, which is the less obvious use.",
    rhodes:
      "A Ready-mode track with strong Motivation and a higher Calm than most in its mode — which is the distinguishing commercial feature. With Motivation high and Calm mid-range, this is not an apex-performance anthem; it is a social-energy track. The difference matters for placement. Where extreme-Ready tracks are built for competition, this is built for the first hour of a night that hasn't peaked yet. Lead with fashion-week content, club-culture brand campaigns, and summer-season retail activation. The contemporary synth architecture gives it commercial longevity that harder-edged Ready tracks lack. The mid-range Calm specifically opens doors in beauty and fragrance campaigns that avoid low-Calm aggression. This is versatile Ready, not singular Ready.",
    signature:
      "Social-energy Ready mode. Built for the night, not the competition.",
    placements: [
      {
        title: "Fashion week and runway content",
        body: "Collection-reveal films, designer brand campaigns, runway editorial. The contemporary energy sits outside athletic clichés while delivering directional momentum.",
      },
      {
        title: "Beauty and fragrance brand campaigns",
        body: "Prestige fragrance films, makeup brand launch spots, skincare editorial. The mid-range Calm opens placement doors that harder Ready tracks cannot access.",
      },
      {
        title: "Summer retail and seasonal activation",
        body: "Apparel brand summer campaigns, festival-season content, outdoor retail editorial. Works across both short-form digital and longer retail brand films.",
      },
    ],
    throughline:
      "A song for the beginning of the best night. Built for fashion, fragrance, and the moments where culture moves — runway, launch, season — where the energy is high and the aggression is optional.",
    comparable:
      "Lives in the same contemporary fashion territory as Dua Lipa's recent brand campaign work, with Peggy Gou as its closest sound sibling in fashion-house and luxury editorial sync markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Fashion + retail", pct: 92 },
        { name: "Brand + lifestyle", pct: 78 },
        { name: "Film + television", pct: 61 },
        { name: "Athletic + sport", pct: 31 },
      ],
      confidence: "high",
      n_briefs: 194,
      sample_brief:
        "Global fashion house · new collection reveal film · contemporary Ready-mode RFP · active 12 days  //  in-house creative team, mid-six-figure production",
    },
  },
  "hollow-meridian": {
    consider:
      "Focus and Balance sit close together above the rest, and that pairing is the interesting part: immersion that does not tip into intensity. Consider where you need attention held without the room changing temperature. That is a narrower ask than it sounds, and it is what this profile is built to do.",
    rhodes:
      "A Flow-mode track with exceptional Focus and a cinematic quality that separates it from standard grooves in the mode. Focus and Flow both high, with Motivation at mid-range — this is a song with inner stillness rather than outward energy. The result is a track that creates an atmosphere rather than a feeling, which is a specific and valuable commercial quality. Lead with nature documentary, luxury automotive, and architecture brand films where the music must sustain a visual world without directing it. Mid-range Motivation narrows the moments it fits. Pair with a higher-Motivation track on pitches to supervisors who need both atmosphere and forward movement. The track earns its placement when it has context alongside it.",
    signature:
      "Cinematic stillness at high resolution. Builds an atmosphere rather than a feeling.",
    placements: [
      {
        title: "Nature and exploration documentary",
        body: "Wilderness documentary sequences, ocean and climate film content, geography and travel documentary. Flexible across both underscore and featured-cue contexts.",
      },
      {
        title: "Luxury automotive brand films",
        body: "Premium vehicle long-form brand films, brand-heritage retrospectives, driving-experience campaigns. Sits outside the typical performance-anthem placement, differentiating on brief.",
      },
      {
        title: "Architecture and high-concept design editorial",
        body: "Architectural brand films, design-week editorial, luxury residential and hospitality campaigns. The restraint is the virtue — presence without direction.",
      },
    ],
    throughline:
      "A song that exists in its own atmosphere. Built for visuals that trust silence — documentary, luxury automotive, and architectural editorial where the music's job is to deepen the world rather than explain it.",
    comparable:
      "Lives in the same cinematic territory as Brian Eno's ambient catalog for luxury and documentary use, with Nils Frahm as its closest contemporary sibling in architectural and high-concept brand markets.",
    where_this_music_lives: {
      verticals: [
        { name: "Documentary + nature", pct: 84 },
        { name: "Brand + luxury", pct: 79 },
        { name: "Film + television", pct: 71 },
        { name: "Athletic + sport", pct: 11 },
      ],
      confidence: "moderate",
      n_briefs: 89,
      sample_brief:
        "Luxury European automotive brand · heritage film · cinematic Flow-mode atmosphere RFP · active 11 days  //  agency-side, premium budget tier",
    },
  },
};
