import { describe, expect, it } from "vitest";
import { parseCreatorBrief } from "../src/lib/song-where/creator-brief.server";

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
});
