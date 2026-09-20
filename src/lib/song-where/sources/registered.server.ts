import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMachineFeed } from "./machine-feed.server";
import { publicHttpsUrl } from "./public-url.server";
import type { OpportunitySourceAdapter } from "./feed.server";

type Db = ReturnType<typeof createAdminClient>;

export async function registeredSources(db: Db): Promise<OpportunitySourceAdapter[]> {
  const { data, error } = await db.from("opportunity_sources")
    .select("name,kind,trust_level,source_url,base_url,terms_status,robots_status,auth_scope")
    .eq("active", true).limit(10);
  if (error) throw error;
  return (data ?? []).flatMap((row): OpportunitySourceAdapter[] => {
    if (row.kind !== "feed" || row.trust_level !== "verified" ||
        row.terms_status !== "cc0" || row.robots_status !== "allow" ||
        row.auth_scope !== "none") return [];
    const feed = typeof row.source_url === "string" ? publicHttpsUrl(row.source_url) : null;
    if (!feed || feed.origin !== row.base_url) return [];
    return [{ name: row.name, kind: "feed", trust: "verified", baseUrl: feed.origin,
      async fetch() {
        const response = await fetch(feed, { cache: "no-store", redirect: "error",
          headers: { Accept: "application/feed+json, application/rss+xml, application/atom+xml, application/xml",
            "User-Agent": "CHRP-SongWhere/1.0" }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("feed unavailable");
        const declared = Number(response.headers.get("content-length"));
        if (declared > 500_000) throw new Error("feed too large");
        return parseMachineFeed(await response.text(), response.headers.get("content-type") ?? "", feed.href);
      } }];
  });
}
