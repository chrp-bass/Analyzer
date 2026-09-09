/**
 * Human and GitHub-summary renderings of a sentinel report. Pure module.
 */

import { BOUNDARY_ORDER, type BoundaryResult, type CheckStatus, type SentinelReport } from "./types";

const MARK: Record<CheckStatus, string> = {
  PASS: "✓",
  WARN: "!",
  FAIL: "✗",
  NOT_EXERCISED: "–",
};

const EMOJI: Record<CheckStatus, string> = {
  PASS: "✅",
  WARN: "⚠️",
  FAIL: "❌",
  NOT_EXERCISED: "⏸️",
};

const OVERALL_EMOJI = { GREEN: "🟢", YELLOW: "🟡", RED: "🔴" } as const;

function ordered(boundaries: readonly BoundaryResult[]): BoundaryResult[] {
  return [...boundaries].sort((a, b) => BOUNDARY_ORDER.indexOf(a.boundary) - BOUNDARY_ORDER.indexOf(b.boundary));
}

function counts(b: BoundaryResult): string {
  const c = { PASS: 0, WARN: 0, FAIL: 0, NOT_EXERCISED: 0 };
  for (const ch of b.checks) c[ch.status] += 1;
  return `${c.PASS} pass, ${c.WARN} warn, ${c.FAIL} fail, ${c.NOT_EXERCISED} not exercised`;
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "unknown";
}

export function formatHuman(report: SentinelReport): string {
  const lines: string[] = [];
  lines.push(`CHRP Analyzer production sentinel — ${report.overall}`);
  lines.push(
    `target ${report.target.baseUrl}  sha ${shortSha(report.deployment.sha)}${report.target.expectedSha ? ` (expected ${shortSha(report.target.expectedSha)})` : ""}  deployment ${report.deployment.deploymentId ?? "unknown"}  ${report.generatedAt}  ${report.ms}ms`,
  );
  for (const b of ordered(report.boundaries)) {
    lines.push(`  ${MARK[b.status]} ${b.boundary.padEnd(12)} ${b.status.padEnd(13)} ${counts(b)}  ${b.ms}ms`);
    for (const c of b.checks) {
      lines.push(`      ${MARK[c.status]} ${c.id.padEnd(30)} ${c.status.padEnd(13)} ${c.summary}`);
    }
  }
  return lines.join("\n");
}

export function formatMarkdown(report: SentinelReport): string {
  const out: string[] = [];
  out.push(`## ${OVERALL_EMOJI[report.overall]} Production sentinel: ${report.overall}`);
  out.push("");
  out.push(`| target | sha | deployment | expected sha | generated | duration |`);
  out.push(`| --- | --- | --- | --- | --- | --- |`);
  out.push(
    `| ${report.target.baseUrl} | \`${shortSha(report.deployment.sha)}\` | \`${report.deployment.deploymentId ?? "unknown"}\` | \`${report.target.expectedSha ? shortSha(report.target.expectedSha) : "n/a"}\` | ${report.generatedAt} | ${report.ms}ms |`,
  );
  out.push("");
  for (const b of ordered(report.boundaries)) {
    out.push(`### ${EMOJI[b.status]} ${b.boundary} — ${b.status} (${b.ms}ms)`);
    out.push("");
    out.push(`| check | status | summary |`);
    out.push(`| --- | --- | --- |`);
    for (const c of b.checks) {
      out.push(`| \`${c.id}\` | ${EMOJI[c.status]} ${c.status} | ${escapeCell(c.summary)} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
