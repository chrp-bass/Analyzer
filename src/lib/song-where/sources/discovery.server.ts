import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicHttpsUrl } from "./public-url.server";
import { configuredSearchIndex, scoutQueries, watchlist } from "./scout.server";
import { parsePublicOpportunityPage } from "./public-page.server";

type Db = ReturnType<typeof createAdminClient>;
// Discovery never signs in or submits a form.

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
  let hasApplicableRules = false;
  let allow = "";
  let deny = "";
  for (const line of body.split(/\r?\n/)) {
    const clean = line.split("#", 1)[0].trim();
    const [key, ...rest] = clean.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) {
      applies = value === "*" || /^CHRP-SongWhere/i.test(value);
      if (applies) hasApplicableRules = true;
    }
    if (!applies) continue;
    if (/^allow$/i.test(key) && value && path.startsWith(value) && value.length > allow.length) allow = value;
    if (/^disallow$/i.test(key) && value && path.startsWith(value) && value.length > deny.length) deny = value;
  }
  if (!hasApplicableRules) return "unverified";
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

/** Public pointers require access verification, not a license to republish text. */
export async function discoverOnce(db: Db = createAdminClient()): Promise<{
  examined: number; candidates: number; admitted: number; searchActive: boolean;
}> {
  const day = Math.floor(Date.now() / 86_400_000);
  const stopAt = Date.now() + 35_000;
  const seeds = watchlist(day);
  const search = configuredSearchIndex();
  let candidates = 0;
  if (search) for (const query of scoutQueries(day)) {
    if (Date.now() >= stopAt) break;
    try {
      for (const url of await search.discover(query)) {
        const { error } = await db.from("opportunity_source_candidates").upsert({
          url, discovered_from: "licensed_search_index", access_type: "page",
          status: "quarantined", reason: "awaiting_source_verification",
        }, { onConflict: "url", ignoreDuplicates: true });
        if (error) throw error;
        candidates++;
      }
    } catch { /* Search failure cannot stop public-source checks. */ }
  }
  const { data: queued, error: queueError } = await db.from("opportunity_source_candidates")
    .select("url").eq("access_type", "page").eq("status", "quarantined")
    .order("checked_at", { ascending: true, nullsFirst: true }).limit(4);
  if (queueError) throw queueError;
  const pages = Array.from(new Set([...seeds, ...(queued ?? []).map((row) => row.url)]));
  let examined = 0;
  let admitted = 0;
  for (const seed of pages) {
    if (Date.now() >= stopAt) break;
    examined++;
    const page = publicHttpsUrl(seed);
    if (!page) continue;
    const { error: seedError } = await db.from("opportunity_source_candidates").upsert({
      url: page.href, discovered_from: seeds.includes(seed) ? "public_watchlist" : "linked_public_page",
      access_type: "page", status: "quarantined", reason: "awaiting_source_verification",
    }, { onConflict: "url", ignoreDuplicates: true });
    if (seedError) throw seedError;
    let html = "";
    let policy = "";
    let robots: "allow" | "deny" | "unverified" = "unverified";
    try {
      const robotsResponse = await fetch(new URL("/robots.txt", page), { cache: "no-store", redirect: "error",
        headers: { "User-Agent": "CHRP-SongWhere/1.0" }, signal: AbortSignal.timeout(8000) });
      if (robotsResponse.status === 404 || robotsResponse.status === 410) robots = "allow";
      else if (robotsResponse.ok) {
        policy = await robotsResponse.text();
        if (policy.length > 200_000) throw new Error("robots too large");
        robots = robotsStatus(policy, page.pathname);
      }
      if (robots === "allow") html = await boundedGet(page, "text/html");
    } catch { /* Inability to verify is a quarantine, not permission. */ }
    const parsed = html ? parsePublicOpportunityPage(html, page.href) : null;
    const admissiblePage = robots === "allow" && !!parsed;
    const pageSourceName = `public-${page.hostname}-${createHash("sha256").update(page.href).digest("hex").slice(0, 8)}`;
    const { error: checkedError } = await db.from("opportunity_source_candidates").update({
      robots_status: robots, terms_status: robots === "allow" ? "public_pointer" : "unverified",
      status: admissiblePage ? "admitted" : "quarantined", checked_at: new Date().toISOString(),
      reason: admissiblePage ? null : robots === "allow" ? "no_verified_open_opportunity" : "robots_unverified_or_denied",
    }).eq("url", page.href);
    if (checkedError) throw checkedError;
    if (admissiblePage) {
      const { error } = await db.from("opportunity_sources").upsert({ name: pageSourceName, kind: "page",
        trust_level: "verified", base_url: page.origin, source_url: page.href,
        access_type: "page", robots_status: "allow", terms_status: "public_pointer",
        auth_scope: "none", active: true, updated_at: new Date().toISOString(),
      }, { onConflict: "name" });
      if (error) throw error;
      admitted++;
    } else {
      const { error } = await db.from("opportunity_sources").update({ active: false,
        quarantine_reason: robots === "allow" ? "no_verified_open_opportunity" : "robots_unverified_or_denied",
        updated_at: new Date().toISOString() }).eq("name", pageSourceName);
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
      const feedRobots = policy ? robotsStatus(policy, feed.pathname) : robots;
      const admissible = feedRobots === "allow";
      const { error } = await db.from("opportunity_source_candidates").upsert({
        url: feed.href, discovered_from: page.href, access_type: "feed",
        robots_status: feedRobots, terms_status: admissible ? "public_pointer" : "unverified",
        status: admissible ? "admitted" : "quarantined",
        reason: admissible ? null : "robots_unverified_or_denied",
        checked_at: new Date().toISOString(),
      }, { onConflict: "url" });
      if (error) throw error;
      if (!admissible) continue;
      const name = `feed-${createHash("sha256").update(feed.href).digest("hex").slice(0, 16)}`;
      const { error: sourceError } = await db.from("opportunity_sources").upsert({
        name, kind: "feed", trust_level: "verified", base_url: feed.origin,
        source_url: feed.href, access_type: "feed", robots_status: "allow",
        terms_status: "public_pointer", terms_url: page.href, auth_scope: "none",
        active: true, updated_at: new Date().toISOString(),
      }, { onConflict: "name" });
      if (sourceError) throw sourceError;
      admitted++;
    }
  }
  return { examined, candidates, admitted, searchActive: !!search };
}
