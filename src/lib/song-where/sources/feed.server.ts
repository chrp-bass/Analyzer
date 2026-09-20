import "server-only";
import { createHash } from "node:crypto";
import { normalizeTarget, type OpportunityTarget } from "../normalize.server";
import { safeSubmissionUrl } from "../store.supabase";

export type SourceOpportunity = {
  externalRef: string;
  title: string;
  rawText: string | null;
  submissionUrl: string;
  deadline: string | null;
  status: "open" | "closed";
  target: OpportunityTarget;
  contentHash: string;
  provenanceUrl?: string | null;
  budgetText?: string | null;
  useText?: string | null;
  territoryText?: string | null;
  moodContext?: string | null;
  applicantCount?: number | null;
  competitionLevel?: "low" | "medium" | "high" | null;
  eligibilityRequirements?: Record<string, unknown>;
  eligibilityText?: string | null;
  fetchedAt?: string;
  verificationStatus?: string;
};

export interface OpportunitySourceAdapter {
  name: string;
  kind: "api" | "feed" | "page";
  trust: "verified" | "curated";
  baseUrl: string;
  fetch(): Promise<SourceOpportunity[]>;
}

/**
 * Adapter for a feed the publisher explicitly makes available to CHRP.
 * The URL and rights must be reviewed before configuring it. It is not a
 * generic web scraper: it accepts only a small, documented JSON contract.
 */
export function jsonFeedAdapter(config: {
  url: string;
  name: string;
  trust: "verified" | "curated";
}): OpportunitySourceAdapter {
  const feedUrl = safeSubmissionUrl(config.url);
  if (!feedUrl || feedUrl.protocol !== "https:") throw new Error("invalid feed URL");
  return {
    name: config.name,
    kind: "api",
    trust: config.trust,
    baseUrl: feedUrl.origin,
    async fetch() {
      const response = await fetch(feedUrl, { cache: "no-store", redirect: "error",
        headers: { Accept: "application/json", "User-Agent": "CHRP-SongWhere/1.0" },
        signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`feed returned ${response.status}`);
      const raw = await response.text();
      if (raw.length > 500_000) throw new Error("feed too large");
      const parsed = JSON.parse(raw) as { items?: unknown };
      if (!Array.isArray(parsed.items)) throw new Error("feed items missing");
      return parsed.items.slice(0, 50).flatMap((item): SourceOpportunity[] => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const destination = typeof row.submissionUrl === "string" ? safeSubmissionUrl(row.submissionUrl) : null;
        const target = normalizeTarget(row.target);
        const provenance = typeof row.url === "string" ? safeSubmissionUrl(row.url) : null;
        if (typeof row.id !== "string" || !row.id || row.id.length > 200 ||
            typeof row.title !== "string" || !row.title || row.title.length > 300 ||
            !destination || !provenance || !target || row.status !== "open") return [];
        const deadline = typeof row.deadline === "string" && Number.isFinite(Date.parse(row.deadline))
          ? new Date(row.deadline).toISOString() : null;
        if (!deadline || deadline <= new Date().toISOString()) return [];
        const status = row.status;
        const rawText = typeof row.description === "string" ? row.description.slice(0, 5000) : null;
        const contentHash = createHash("sha256").update(JSON.stringify({
          title: row.title, submissionUrl: destination.href, deadline, status, target, rawText,
        })).digest("hex");
        return [{ externalRef: row.id, title: row.title, rawText: null, submissionUrl: destination.href,
          deadline, status, target, contentHash, provenanceUrl: provenance.href }];
      });
    },
  };
}

export function configuredSources(): OpportunitySourceAdapter[] {
  const url = process.env.SONG_WHERE_FEED_URL;
  const name = process.env.SONG_WHERE_FEED_NAME;
  // No source is silently assumed. This remains empty until rights and format
  // are verified for a qualifying publisher.
  return url && name ? [jsonFeedAdapter({ url, name, trust: "curated" })] : [];
}
