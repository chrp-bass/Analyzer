import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicHttpsUrl } from "./public-url.server";

type Db = ReturnType<typeof createAdminClient>;
// Public starting points only. Discovery never signs in or submits a form.
const SEEDS = [
  "https://played.fm/sync", "https://pitch.hrdrv.com/",
  "https://www.tracksynk.com/news/briefs-are-live", "https://www.syncbrief.com/",
];

async function boundedGet(url: URL, accept: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store", redirect: "error",
    headers: { Accept: accept, "User-Agent": "CHRP-SongWhere/1.0" },
    signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("source unavailable");
  const declared = Number(response.headers.get("content-length"));
  if (declared > 200_000) throw new Error("source too large");
  const body = await response.text();
  if (body.length > 200_000) throw new Error("source too large");
  return body;
}

function robotsStatus(body: string, path: string): "allow" | "deny" | "unverified" {
  let applies = false;
  let allow = "";
  let deny = "";
  for (const line of body.split(/\r?\n/)) {
    const clean = line.split("#", 1)[0].trim();
    const [key, ...rest] = clean.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) applies = value === "*" || /^CHRP-SongWhere/i.test(value);
    if (!applies) continue;
    if (/^allow$/i.test(key) && value && path.startsWith(value) && value.length > allow.length) allow = value;
    if (/^disallow$/i.test(key) && value && path.startsWith(value) && value.length > deny.length) deny = value;
  }
  return deny.length > allow.length ? "deny" : "allow";
}

function feedLinks(html: string, page: URL): URL[] {
  const links = Array.from(html.matchAll(/<link\b[^>]*>/gi), ([tag]) => tag).slice(0, 100);
  return links.flatMap((tag) => {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel.split(/\s+/).includes("alternate") || !/application\/(?:rss\+xml|atom\+xml|feed\+json|json)/i.test(type) || !href) return [];
    try {
      const url = publicHttpsUrl(new URL(href, page).href);
      return url && url.origin === page.origin ? [url] : [];
    } catch { return []; }
  });
}

function linkedSourcePages(html: string, page: URL): URL[] {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([^<]{0,120})/gi));
  const found = new Map<string, URL>();
  for (const [, href, label] of anchors.slice(0, 200)) {
    if (!/\b(?:sync|music|briefs?|opportunit(?:y|ies))\b/i.test(`${href} ${label}`)) continue;
    try {
      const url = publicHttpsUrl(new URL(href, page).href);
      if (url && url.origin !== page.origin) found.set(url.href, url);
    } catch { continue; }
    if (found.size >= 5) break;
  }
  return Array.from(found.values());
}

function cc0Rights(html: string): boolean {
  return /<link\b[^>]*\brel\s*=\s*["']license["'][^>]*\bhref\s*=\s*["']https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?["'][^>]*>/i.test(html);
}

/** Unknown terms, robots or feed shape are quarantined, never silently admitted. */
export async function discoverOnce(db: Db = createAdminClient()): Promise<{
  examined: number; candidates: number; admitted: number;
}> {
  const { data: queued, error: queueError } = await db.from("opportunity_source_candidates")
    .select("url").eq("access_type", "page").eq("status", "quarantined")
    .order("checked_at", { ascending: true, nullsFirst: true }).limit(6);
  if (queueError) throw queueError;
  const pages = [...SEEDS, ...(queued ?? []).map((row) => row.url)];
  const stopAt = Date.now() + 35_000;
  let examined = 0;
  let candidates = 0;
  let admitted = 0;
  for (const seed of pages) {
    if (Date.now() >= stopAt) break;
    examined++;
    const page = publicHttpsUrl(seed);
    if (!page) continue;
    let html = "";
    let policy = "";
    let robots: "allow" | "deny" | "unverified" = "unverified";
    try {
      policy = await boundedGet(new URL("/robots.txt", page), "text/plain");
      robots = robotsStatus(policy, page.pathname);
      if (robots === "allow") html = await boundedGet(page, "text/html");
    } catch { /* Inability to verify is a quarantine, not permission. */ }
    if (!SEEDS.includes(seed)) {
      const { error } = await db.from("opportunity_source_candidates").update({
        robots_status: robots, checked_at: new Date().toISOString(),
        reason: robots === "allow" ? "reuse_rights_unverified" : "robots_unverified_or_denied",
      }).eq("url", seed);
      if (error) throw error;
    }
    if (html) for (const linked of linkedSourcePages(html, page)) {
      const { error } = await db.from("opportunity_source_candidates").upsert({
        url: linked.href, discovered_from: page.href, access_type: "page",
        status: "quarantined", reason: "awaiting_public_source_review",
      }, { onConflict: "url", ignoreDuplicates: true });
      if (error) throw error;
      candidates++;
    }
    const links = html ? feedLinks(html, page) : [];
    for (const feed of links.slice(0, 5)) {
      candidates++;
      const feedRobots = policy ? robotsStatus(policy, feed.pathname) : "unverified";
      const rights = cc0Rights(html);
      const admissible = feedRobots === "allow" && rights;
      const { error } = await db.from("opportunity_source_candidates").upsert({
        url: feed.href, discovered_from: page.href, access_type: "feed",
        robots_status: feedRobots, terms_status: rights ? "cc0" : "unverified",
        status: admissible ? "admitted" : "quarantined",
        reason: admissible ? null : feedRobots !== "allow" ? "robots_unverified_or_denied" : "reuse_rights_unverified",
        checked_at: new Date().toISOString(),
      }, { onConflict: "url" });
      if (error) throw error;
      if (!admissible) continue;
      const name = `feed-${createHash("sha256").update(feed.href).digest("hex").slice(0, 16)}`;
      const { error: sourceError } = await db.from("opportunity_sources").upsert({
        name, kind: "feed", trust_level: "verified", base_url: feed.origin,
        source_url: feed.href, access_type: "feed", robots_status: "allow",
        terms_status: "cc0", terms_url: page.href, auth_scope: "none",
        active: true, updated_at: new Date().toISOString(),
      }, { onConflict: "name" });
      if (sourceError) throw sourceError;
      admitted++;
    }
  }
  return { examined, candidates, admitted };
}
