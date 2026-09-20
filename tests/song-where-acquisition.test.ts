import { describe, expect, it } from "vitest";
import { parseMachineFeed } from "../src/lib/song-where/sources/machine-feed.server";
import { publicHttpsUrl } from "../src/lib/song-where/sources/public-url.server";
import { POST as inbound } from "../src/app/api/song-where/inbound/route";

const source = "https://briefs.example.org/feed.xml";

describe("autonomous acquisition safety", () => {
  it("accepts only explicit routes and preserves unknown targets", () => {
    const feed = { items: [
      { id: "a", title: "Real publisher brief", url: "https://briefs.example.org/a",
        submissionUrl: "https://briefs.example.org/submit/a", status: "open",
        deadline: "2026-10-10T00:00:00Z", budget: "$1000", mood: "cinematic" },
      { id: "b", title: "Article, not a brief", url: "https://briefs.example.org/b", status: "open" },
    ] };
    const results = parseMachineFeed(JSON.stringify(feed), "application/feed+json", source);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ externalRef: "a", target: {},
      provenanceUrl: "https://briefs.example.org/a", budgetText: "$1000", moodContext: "cinematic" });
  });

  it("parses a bounded RSS item only when a submission route is explicitly published", () => {
    const feed = `<rss version="2.0"><channel><item><guid>one</guid><title>Open call</title>
      <link>https://briefs.example.org/one</link><songwhere:submissionUrl>https://briefs.example.org/submit/one</songwhere:submissionUrl>
      <songwhere:status>open</songwhere:status><songwhere:target>{"modes":["Ready"]}</songwhere:target>
      </item><item><guid>two</guid><title>News</title><link>https://briefs.example.org/two</link></item>
      </channel></rss>`;
    expect(parseMachineFeed(feed, "application/rss+xml", source)).toMatchObject([
      { externalRef: "one", target: { modes: ["Ready"] } },
    ]);
  });

  it("rejects private and credentialed outbound URLs", () => {
    expect(publicHttpsUrl("https://127.0.0.1/feed")).toBeNull();
    expect(publicHttpsUrl("https://metadata.google.internal/feed")).toBeNull();
    expect(publicHttpsUrl("https://user:pass@example.org/feed")).toBeNull();
    expect(publicHttpsUrl("http://example.org/feed")).toBeNull();
    expect(publicHttpsUrl(source)?.href).toBe(source);
  });

  it("rejects unsigned inbound mail before touching storage", async () => {
    const prior = process.env.SONG_WHERE_INBOUND_SECRET;
    try {
      process.env.SONG_WHERE_INBOUND_SECRET = "x".repeat(32);
      const response = await inbound(new Request("https://scan.chrp.ai/api/song-where/inbound", {
        method: "POST", body: JSON.stringify({ messageId: "fake" }),
      }));
      expect(response.status).toBe(403);
    } finally {
      if (prior === undefined) delete process.env.SONG_WHERE_INBOUND_SECRET;
      else process.env.SONG_WHERE_INBOUND_SECRET = prior;
    }
  });
});
