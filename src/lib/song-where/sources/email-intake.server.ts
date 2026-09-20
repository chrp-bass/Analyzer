import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTarget } from "../normalize.server";
import { publicHttpsUrl } from "./public-url.server";
import { verifySubmissionRoute } from "../quality.server";

type Db = ReturnType<typeof createAdminClient>;
export type InboundBrief = { messageId: string; from: string; subject: string;
  text: string; receivedAt: string; dkimPass: boolean; spfPass: boolean };

function explicit(text: string, label: string, max: number): string | null {
  const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim().slice(0, max) || null;
}

/** Only authenticated newsletter mail from an already admitted sender can create supply. */
export async function ingestInboundBrief(input: InboundBrief, db: Db = createAdminClient()): Promise<{
  status: "normalized" | "quarantined" | "duplicate";
}> {
  if (!input.messageId || input.messageId.length > 255 || !input.from ||
      !input.subject || input.subject.length > 300 || input.text.length > 50_000 ||
      !Number.isFinite(Date.parse(input.receivedAt))) throw new Error("invalid inbound message");
  const { data: existing, error: existingError } = await db.from("opportunity_inbox_messages")
    .select("id").eq("provider_message_id", input.messageId).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return { status: "duplicate" };
  const from = input.from.match(/<?[^<>\s@]+@([^<>\s@]+)>?$/)?.[1]?.toLowerCase();
  const sourceUrl = explicit(input.text, "Source URL", 2000);
  const submissionUrl = explicit(input.text, "Submission URL", 2000);
  const provenance = sourceUrl ? publicHttpsUrl(sourceUrl) : null;
  const destination = submissionUrl ? publicHttpsUrl(submissionUrl) : null;
  const deadlineText = explicit(input.text, "Deadline", 80);
  const deadline = deadlineText && Number.isFinite(Date.parse(deadlineText))
    ? new Date(deadlineText).toISOString() : null;
  const statusText = explicit(input.text, "Status", 20)?.toLowerCase();
  const targetText = explicit(input.text, "CHRP Target JSON", 2000);
  let target = {};
  try { target = targetText ? normalizeTarget(JSON.parse(targetText)) ?? {} : {}; } catch { /* unknown stays unknown */ }
  const { data: sources, error: sourceError } = await db.from("opportunity_sources")
    .select("id,base_url,active,terms_status,auth_scope")
    .eq("kind", "newsletter").eq("active", true).limit(20);
  if (sourceError) throw sourceError;
  const approved = !!from && (sources ?? []).find((row) => {
    try { return new URL(row.base_url).hostname === from && row.terms_status === "permitted" && row.auth_scope === "none"; }
    catch { return false; }
  });
  const admissible = input.dkimPass === true && input.spfPass === true && approved && provenance && destination &&
    statusText === "open" && (!deadline || deadline > new Date().toISOString());
  let opportunityId: string | null = null;
  if (admissible) {
    const contentHash = createHash("sha256").update(JSON.stringify({
      subject: input.subject, text: input.text, destination: destination.href,
    })).digest("hex");
    const { data, error } = await db.from("opportunities").upsert({
      source_id: approved.id, external_ref: input.messageId, title: input.subject,
      raw_text: input.text.slice(0, 5000), status: "open", submission_url: destination.href,
      deadline, target, normalizer_version: "email-explicit-v1", content_hash: contentHash,
      provenance_url: provenance.href, budget_text: explicit(input.text, "Budget", 200),
      use_text: explicit(input.text, "Use", 300), territory_text: explicit(input.text, "Territory", 200),
      mood_context: explicit(input.text, "Mood", 500), synthetic: false,
      route_verified_at: await verifySubmissionRoute(destination.href),
      eligibility_requirements: explicit(input.text, "Eligibility", 1000)
        ? { unverified: explicit(input.text, "Eligibility", 1000) } : {},
    }, { onConflict: "source_id,external_ref" }).select("id").single();
    if (error) throw error;
    opportunityId = data.id;
  }
  const { error: ledgerError } = await db.from("opportunity_inbox_messages").insert({
    provider_message_id: input.messageId, sender: input.from, subject: input.subject,
    received_at: new Date(input.receivedAt).toISOString(),
    status: admissible ? "normalized" : "quarantined",
    reason: admissible ? null : "unverified_sender_or_missing_explicit_fields",
    opportunity_id: opportunityId,
  });
  if (ledgerError) throw ledgerError;
  return { status: admissible ? "normalized" : "quarantined" };
}
