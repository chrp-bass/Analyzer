import { describe, expect, it, vi } from "vitest";
import { parseMachineFeed } from "../src/lib/song-where/sources/machine-feed.server";
import { publicHttpsUrl } from "../src/lib/song-where/sources/public-url.server";
import { POST as inbound } from "../src/app/api/song-where/inbound/route";
import { configuredSearchIndex, scoutQueries, watchlist } from "../src/lib/song-where/sources/scout.server";
import { parsePublicOpportunityPage } from "../src/lib/song-where/sources/public-page.server";

const source = "https://briefs.example.org/feed.xml";
const futureDeadline = new Date(Date.now() + 30 * 86_400_000).toISOString();

describe("autonomous acquisition safety", () => {
  it("admits factual public pointers without copying the brief, but rejects closed or route-less pages", () => {
    const url = "https://publisher.example.org/call";
    const html = `<html><h1>Pitch Your Music</h1><p>2026 Open Call</p>
      <p>Deadline: 25 September 2026</p><p>All genres are welcome.</p>
      <form><button type="submit">Submit Form</button></form>
      <p>Private creative direction must not be stored.</p></html>`;
    const now = new Date("2026-09-20T12:00:00Z");
    expect(parsePublicOpportunityPage(html, url, now)).toMatchObject({
      title: "Pitch Your Music", deadline: "2026-09-25T23:59:59.000Z",
      submissionUrl: url, provenanceUrl: url, rawText: null, target: {},
      eligibilityText: "All genres are welcome.", verificationStatus: "verified",
    });
    expect(parsePublicOpportunityPage(html.replace("<form><button type=\"submit\">Submit Form</button></form>", ""), url, now)).toBeNull();
    expect(parsePublicOpportunityPage(html, url, new Date("2026-09-26T12:00:00Z"))).toBeNull();
    expect(parsePublicOpportunityPage(html.replace("Open Call", "Call Closed"), url, now)).toBeNull();
  });
  it("rotates public watchlist and search queries without implying source permission", () => {
    const previous = process.env.SONG_WHERE_BRAVE_SEARCH_KEY;
    delete process.env.SONG_WHERE_BRAVE_SEARCH_KEY;
    try {
      expect(configuredSearchIndex()).toBeNull();
      expect(watchlist(0)).not.toEqual(watchlist(1));
      expect(scoutQueries(0)).not.toEqual(scoutQueries(1));
      expect(watchlist(0).every((url) => publicHttpsUrl(url))).toBe(true);
    } finally {
      if (previous !== undefined) process.env.SONG_WHERE_BRAVE_SEARCH_KEY = previous;
    }
  });

  it("uses licensed search only for public candidate URLs, never snippet evidence", async () => {
    const prior = process.env.SONG_WHERE_BRAVE_SEARCH_KEY;
    const originalFetch = global.fetch;
    process.env.SONG_WHERE_BRAVE_SEARCH_KEY = "existing-test-key";
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ web: { results: [
      { url: "https://publisher.example.org/brief", description: "open, guaranteed!" },
      { url: "http://127.0.0.1/private", description: "open" },
    ] } }), { status: 200 }));
    try {
      expect(await configuredSearchIndex()!.discover("sync brief")).toEqual([
        "https://publisher.example.org/brief",
      ]);
    } finally {
      global.fetch = originalFetch;
      if (prior === undefined) delete process.env.SONG_WHERE_BRAVE_SEARCH_KEY;
      else process.env.SONG_WHERE_BRAVE_SEARCH_KEY = prior;
    }
  });
  it("accepts only explicit routes and preserves unknown targets", () => {
    const feed = { items: [
      { id: "a", title: "Real publisher brief", url: "https://briefs.example.org/a",
        submissionUrl: "https://briefs.example.org/submit/a", status: "open",
        deadline: futureDeadline, budget: "$1000", mood: "cinematic" },
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
      <songwhere:deadline>${futureDeadline}</songwhere:deadline>
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
