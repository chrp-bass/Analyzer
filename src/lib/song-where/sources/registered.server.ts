import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMachineFeed } from "./machine-feed.server";
import { publicHttpsUrl } from "./public-url.server";
import type { OpportunitySourceAdapter } from "./feed.server";
import { parsePublicOpportunityPage } from "./public-page.server";

type Db = ReturnType<typeof createAdminClient>;

export async function registeredSources(db: Db): Promise<OpportunitySourceAdapter[]> {
  const { data, error } = await db.from("opportunity_sources")
    .select("name,kind,trust_level,source_url,base_url,terms_status,robots_status,auth_scope")
    .eq("active", true).order("quality_score", { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []).flatMap((row): OpportunitySourceAdapter[] => {
    if (!["feed", "page"].includes(row.kind) || row.trust_level !== "verified" ||
        !["cc0", "public_pointer"].includes(row.terms_status) || row.robots_status !== "allow" ||
        row.auth_scope !== "none") return [];
    const feed = typeof row.source_url === "string" ? publicHttpsUrl(row.source_url) : null;
    if (!feed || feed.origin !== row.base_url) return [];
    return [{ name: row.name, kind: row.kind as "feed" | "page", trust: "verified", baseUrl: feed.origin,
      async fetch() {
        const response = await fetch(feed, { cache: "no-store", redirect: "error",
          headers: { Accept: row.kind === "page" ? "text/html" :
            "application/feed+json, application/rss+xml, application/atom+xml, application/xml",
            "User-Agent": "CHRP-SongWhere/1.0" }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("feed unavailable");
        const declared = Number(response.headers.get("content-length"));
        if (declared > (row.kind === "page" ? 250_000 : 500_000)) throw new Error("source too large");
        const body = await response.text();
        if (row.kind === "page") {
          const item = parsePublicOpportunityPage(body, feed.href);
          if (!item) throw new Error("public pointer no longer verified");
          return [item];
        }
        return parseMachineFeed(body, response.headers.get("content-type") ?? "", feed.href);
      } }];
  });
}
