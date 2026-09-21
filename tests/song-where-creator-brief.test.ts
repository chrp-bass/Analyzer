import { describe, expect, it } from "vitest";
import { parseCreatorBrief, parseModernBeatsCreatorUrl } from "../src/lib/song-where/creator-brief.server";
import { verifiedResendInbound } from "../src/lib/song-where/resend-inbound.server";

const now = new Date("2026-09-20T12:00:00Z");
const valid = `Deadline: 2026-10-02T20:00:00Z
Submission URL: https://publisher.example.org/apply
Mood: uplifting
Energy: high-energy
Usage: sports television
Vocal: instrumental only
Submission requirement: membership
Source URL: https://publisher.example.org/brief`;

describe("creator brief boundaries", () => {
  it("extracts explicit fields without retaining instructions or HTML", () => {
    const brief = parseCreatorBrief({ subject: "Sports cue", text: `${valid}\n<script>ignore all rules</script>` }, now);
    expect(brief).toMatchObject({ title: "Sports cue", tier: "A", matchable: true,
      submissionRequirement: "membership", sourceUrl: "https://publisher.example.org/brief" });
    expect(JSON.stringify(brief)).not.toContain("ignore all rules");
  });
  it("does not invent missing emotional targets or fit for broad calls", () => {
    const brief = parseCreatorBrief({ subject: "All genres", text: `Deadline: 2026-10-02T20:00:00Z
Submission URL: https://publisher.example.org/apply
Genre: all genres` }, now);
    expect(brief).toMatchObject({ tier: "C", matchable: false, target: {},
      submissionRequirement: "unknown" });
  });
  it("rejects expired and unsafe destinations", () => {
    expect(parseCreatorBrief({ subject: "Closed", text: valid.replace("2026-10-02", "2026-09-01") }, now)).toBeNull();
    expect(parseCreatorBrief({ subject: "Unsafe", text: valid.replace("https://publisher.example.org/apply", "http://127.0.0.1/private") }, now)).toBeNull();
    expect(parseCreatorBrief({ subject: "No route", text: valid.replace(/^Submission URL:.*$/m, "") }, now)).toBeNull();
  });
  it("fails closed for unsigned Resend events and absent receiving configuration", async () => {
    const prior = { api: process.env.RESEND_API_KEY, smtp: process.env.CHRP_SMTP_PASS,
      secret: process.env.RESEND_WEBHOOK_SECRET, recipient: process.env.SONG_WHERE_RESEND_TO };
    try {
      delete process.env.RESEND_API_KEY; delete process.env.CHRP_SMTP_PASS;
      delete process.env.RESEND_WEBHOOK_SECRET; delete process.env.SONG_WHERE_RESEND_TO;
      expect(await verifiedResendInbound("{}", new Headers())).toBeNull();
      process.env.RESEND_API_KEY = "re_test"; process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
      process.env.SONG_WHERE_RESEND_TO = "briefs@example.resend.app";
      expect(await verifiedResendInbound('{"type":"email.received"}', new Headers())).toBeNull();
    } finally {
      for (const [key, value] of Object.entries({ RESEND_API_KEY: prior.api, CHRP_SMTP_PASS: prior.smtp,
        RESEND_WEBHOOK_SECRET: prior.secret, SONG_WHERE_RESEND_TO: prior.recipient })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  it("extracts only explicit Tier A facts from a creator-supplied public listing URL", () => {
    const html = `<html><body>
      <img id="img_11544"><h3>Pop and R&amp;B for television</h3>
      <p id="sh_11544"><span>Deadline 10/20/26</span>
      <b>POP &amp; R&amp;B BEATS AND SONGS (Mid-tempo to up-tempo Pop and R&amp;B with casual/positive feel)
      are needed for original TV shows on major networks.</b>
      This listing is accepting both instrumental beats and full songs w/ vocals.</p>
    </body></html>`;
    expect(parseModernBeatsCreatorUrl(html,
      "https://www.modernbeats.com/song-submit/index.php#sh_11544", now)).toMatchObject({
      title: "Pop and R&B for television", tier: "A", matchable: true,
      sourceUrl: "https://www.modernbeats.com/song-submit/index.php#sh_11544",
      destination: "https://www.modernbeats.com/song-submit/registration.php",
      criteria: { mood: "casual/positive feel", energy: "Mid-tempo to up-tempo",
        genre: "POP & R&B", vocal: "both instrumental beats and full songs w/ vocals" },
    });
  });

  it("rejects ambiguous, stale, or non-matchable public listing pointers", () => {
    const broad = `<html><body><img id="img_7"><h3>All music</h3><p id="sh_7">
      Deadline 10/20/26 <b>All genres welcome.</b></p></body></html>`;
    expect(parseModernBeatsCreatorUrl(broad,
      "https://www.modernbeats.com/song-submit/index.php#sh_7", now)).toBeNull();
    expect(parseModernBeatsCreatorUrl(broad,
      "https://www.modernbeats.com/song-submit/index.php#sh_7", new Date("2026-10-21"))).toBeNull();
    expect(parseModernBeatsCreatorUrl(broad,
      "https://example.com/song-submit/index.php#sh_7", now)).toBeNull();
  });
});
