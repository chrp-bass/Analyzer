import "server-only";
import { isCompletePaidPayload } from "@/lib/reports/store";

type ReportRelation = { payload: unknown } | Array<{ payload: unknown }> | null | undefined;

export function hasCompletePaidReport(reports: ReportRelation): boolean {
  const rows = Array.isArray(reports) ? reports : reports ? [reports] : [];
  return rows.some((row) => isCompletePaidPayload(row.payload));
}
