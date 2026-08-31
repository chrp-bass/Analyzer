import "server-only";
import {
  getFreeReportById,
  type FreeReport,
  type PaidSections,
  type ReportPayload,
} from "@/lib/fixtures/tracks";
import { PAID_SECTIONS } from "@/lib/fixtures/tracks.paid";

/**
 * Server-side report assembly.
 *
 * Free reveal data and paid intelligence are joined here and nowhere else,
 * so the merge point is also the audit point: if this module is never
 * imported by a client component, paid prose cannot reach the bundle.
 *
 * Production honesty rule (Phase 8): a hard-coded fixture must never be
 * sold as freshly generated Song Intelligence. In production the paid
 * sections must come from the generator; if that is unavailable the caller
 * gets `null` and is expected to fail visibly and recoverably, preserving
 * the payment rather than fabricating a report.
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Allow fixture prose to stand in for generated intelligence. Off by default
 * in production. Set only for a deliberate demo deployment where fixture
 * content IS the intended product.
 */
const ALLOW_FIXTURE_IN_PROD =
  process.env.CHRP_ALLOW_FIXTURE_REPORTS === "true";

export type ReportSource = "generated" | "fixture";

export interface AssembledReport {
  report: ReportPayload;
  source: ReportSource;
}

export function getFreeReport(slug: string): FreeReport | null {
  return getFreeReportById(slug);
}

/** Paid sections for a slug — fixture content, server-side only. */
export function getFixturePaidSections(slug: string): PaidSections | null {
  return PAID_SECTIONS[slug] ?? null;
}

/**
 * True when serving fixture prose as the paid product is acceptable in this
 * environment. Development: yes. Production: only behind an explicit flag.
 */
export function fixtureReportsPermitted(): boolean {
  return !IS_PRODUCTION || ALLOW_FIXTURE_IN_PROD;
}

/**
 * Assemble the complete paid report for a slug.
 *
 * `generated` takes precedence when supplied. Otherwise fixture prose is
 * used, but only where permitted — in production without the escape hatch
 * this returns null rather than passing a fixture off as real output.
 */
export function getFullReport(
  slug: string,
  generated?: PaidSections | null,
): AssembledReport | null {
  const free = getFreeReportById(slug);
  if (!free) return null;

  if (generated) {
    return { report: { ...free, ...generated }, source: "generated" };
  }

  if (!fixtureReportsPermitted()) return null;

  const paid = PAID_SECTIONS[slug];
  if (!paid) return null;
  return { report: { ...free, ...paid }, source: "fixture" };
}
