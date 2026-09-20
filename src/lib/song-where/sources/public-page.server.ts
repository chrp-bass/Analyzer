import "server-only";
import { createHash } from "node:crypto";
import type { SourceOpportunity } from "./feed.server";
import { publicHttpsUrl } from "./public-url.server";

const decode = (value: string) => value.replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

/** Fail closed on ambiguity; retain factual pointer metadata, never the page body. */
export function parsePublicOpportunityPage(html: string, rawUrl: string, now = new Date()): SourceOpportunity | null {
  const page = publicHttpsUrl(rawUrl);
  if (!page || html.length > 250_000 || !/<html\b/i.test(html)) return null;
  const body = decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  if (!/\b(?:open call|applications? open|submissions? open)\b/i.test(body) ||
      /\b(?:applications? closed|submissions? closed|call closed)\b/i.test(body)) return null;
  const title = decode(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "");
  if (!title || title.length > 300) return null;
  const deadlineText = body.match(/\b(?:deadline|apply by|submit by|closes?)\s*:?\s*((?:\d{1,2}\s+[A-Za-z]+|[A-Za-z]+\s+\d{1,2}),?\s+20\d{2})\b/i)?.[1];
  const deadlineDate = deadlineText ? Date.parse(`${deadlineText} 23:59:59 UTC`) : NaN;
  if (!Number.isFinite(deadlineDate) || deadlineDate <= now.getTime()) return null;
  const form = /<form\b[^>]*>[\s\S]*?<button\b[^>]*type=["']submit["'][^>]*>[\s\S]*?<\/button>[\s\S]*?<\/form>/i.test(html);
  const anchor = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .find(([, , label]) => /\b(?:apply|submit)\b/i.test(label.replace(/<[^>]+>/g, " ")));
  let route = form ? page : null;
  if (!route && anchor) {
    try { route = publicHttpsUrl(new URL(anchor[1], page).href); } catch { /* quarantine */ }
  }
  if (!route) return null;
  const eligibility = body.match(/\b(?:all genres[^.]{0,160}|eligible[^.]{0,160}|open to[^.]{0,160})\./i)?.[0] ?? null;
  if (!eligibility) return null;
  const budget = body.match(/\b(?:budget|fee|prize)\s*:\s*([^.;]{1,80})/i)?.[1]?.trim() ?? null;
  const deadline = new Date(deadlineDate).toISOString();
  return {
    externalRef: page.href, title, rawText: null, submissionUrl: route.href,
    deadline, status: "open", target: {}, provenanceUrl: page.href,
    eligibilityText: eligibility.slice(0, 200), budgetText: budget,
    fetchedAt: now.toISOString(), verificationStatus: "verified",
    contentHash: createHash("sha256").update(JSON.stringify({ title, deadline, route: route.href,
      eligibility, budget })).digest("hex"),
  };
}
