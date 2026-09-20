import "server-only";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { normalizeTarget } from "../normalize.server";
import { safeSubmissionUrl } from "../store.supabase";
import type { SourceOpportunity } from "./feed.server";
import { publicHttpsUrl } from "./public-url.server";

type Row = Record<string, unknown>;
const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : value ? [value] : [];

function normalize(row: Row): SourceOpportunity | null {
  const id = text(row.id ?? row.guid, 200);
  const title = text(row.title, 300);
  const route = text(row.submissionUrl ?? row.submission_url, 2000);
  const destination = route ? safeSubmissionUrl(route) : null;
  const status = row.status === "closed" ? "closed" : row.status === "open" ? "open" : null;
  if (!id || !title || !destination || destination.protocol !== "https:" || !status) return null;
  const sourceUrl = text(row.url ?? row.link, 2000);
  const provenance = sourceUrl ? safeSubmissionUrl(sourceUrl) : null;
  if (!provenance || provenance.protocol !== "https:") return null;
  const rawDeadline = text(row.deadline, 80);
  const deadline = rawDeadline && Number.isFinite(Date.parse(rawDeadline))
    ? new Date(rawDeadline).toISOString() : null;
  const target = normalizeTarget(row.target) ?? {};
  const rawText = text(row.description ?? row.summary ?? row.content_text, 5000);
  const metadata = {
    budget: text(row.budget, 200), use: text(row.use, 300),
    territory: text(row.territory, 200), mood: text(row.mood, 500),
  };
  const applicantCount = Number.isSafeInteger(row.applicantCount) && Number(row.applicantCount) >= 0
    ? Number(row.applicantCount) : null;
  const competitionLevel = ["low", "medium", "high"].includes(String(row.competitionLevel))
    ? row.competitionLevel as "low" | "medium" | "high" : null;
  const eligibilityRequirements = object(row.eligibilityRequirements);
  const contentHash = createHash("sha256").update(JSON.stringify({
    title, route: destination.href, deadline, status, target, rawText, metadata,
    applicantCount, competitionLevel, eligibilityRequirements,
  })).digest("hex");
  return { externalRef: id, title, rawText, submissionUrl: destination.href,
    deadline, status, target, contentHash, provenanceUrl: provenance.href,
    budgetText: metadata.budget, useText: metadata.use,
    territoryText: metadata.territory, moodContext: metadata.mood,
    applicantCount, competitionLevel, eligibilityRequirements };
}

/** Feed metadata alone is never treated as an opportunity or submission route. */
export function parseMachineFeed(body: string, contentType: string, feedUrl: string): SourceOpportunity[] {
  if (!publicHttpsUrl(feedUrl)) throw new Error("invalid feed URL");
  if (body.length > 500_000) throw new Error("feed too large");
  let rows: unknown[];
  if (contentType.includes("json") || body.trimStart().startsWith("{")) {
    const parsed = object(JSON.parse(body));
    if (!Array.isArray(parsed.items)) throw new Error("feed items missing");
    rows = parsed.items;
  } else {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_",
      processEntities: false, numberParseOptions: { eNotation: false, hex: false, leadingZeros: false },
      parseTagValue: false });
    const parsed = object(parser.parse(body));
    const rss = object(object(parsed.rss).channel);
    const atom = object(parsed.feed);
    if (!parsed.rss && !parsed.feed) throw new Error("unsupported feed");
    rows = list(rss.item ?? atom.entry).map((value) => {
      const item = object(value);
      const atomLink = list(item.link).map(object).find((link) => link["@_rel"] === "alternate") ?? {};
      return {
        id: item.guid ?? item.id,
        title: item.title,
        description: item.description ?? item.summary,
        url: typeof item.link === "string" ? item.link : atomLink["@_href"],
        submissionUrl: item["songwhere:submissionUrl"] ?? item.submissionUrl,
        deadline: item["songwhere:deadline"] ?? item.deadline,
        status: item["songwhere:status"] ?? item.status,
        target: item["songwhere:target"] ? JSON.parse(String(item["songwhere:target"])) : item.target,
        budget: item["songwhere:budget"], use: item["songwhere:use"],
        territory: item["songwhere:territory"], mood: item["songwhere:mood"],
        applicantCount: item["songwhere:applicantCount"],
        competitionLevel: item["songwhere:competitionLevel"],
        eligibilityRequirements: item["songwhere:eligibilityRequirements"]
          ? JSON.parse(String(item["songwhere:eligibilityRequirements"])) : undefined,
      };
    });
  }
  return rows.slice(0, 50).flatMap((row) => {
    const result = normalize(object(row));
    return result ? [result] : [];
  });
}
