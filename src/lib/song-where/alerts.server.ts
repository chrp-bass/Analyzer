import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { unlockedScansFor } from "@/lib/commerce/entitlements";
import { sendEmail, renderEmail } from "@/lib/email/send.server";
import { qualityStatus, verifySubmissionRoute, type QualityEvidence } from "./quality.server";
import { parsePublicOpportunityPage } from "./sources/public-page.server";
import { publicHttpsUrl } from "./sources/public-url.server";

type Db = ReturnType<typeof createAdminClient>;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

/** At most ten candidates per call. Queued rows are never resent after an uncertain failure. */
export async function alertBatch(db: Db = createAdminClient()): Promise<{
  examined: number; sent: number; more: boolean;
}> {
  if (process.env.SONG_WHERE_ALERTS_ENABLED !== "true") {
    return { examined: 0, sent: 0, more: false };
  }
  const { data: state, error: stateError } = await db.from("song_where_job_state")
    .select("cursor").eq("stage", "alert").limit(1);
  if (stateError) throw stateError;
  const cursor = state?.[0]?.cursor;
  let query = db.from("song_opportunity_matches")
    .select("id,fit_band,analyses!inner(creator_id,scan_id,songs!inner(track_key)),opportunities!inner(id,title,status,access_class,deadline,submission_url,route_verified_at,provenance_url,applicant_count,competition_level,eligibility_requirements,specificity_tier,song_matchable,opportunity_sources!inner(name,kind,source_url,active,trust_level,terms_status,robots_status,auth_scope))")
    .eq("fit_band", "strong").eq("opportunities.status", "open")
    .neq("opportunities.access_class", "PRIVATE_TO_CREATOR")
    .eq("opportunities.synthetic", false)
    .eq("opportunities.opportunity_sources.active", true)
    .order("id", { ascending: true }).limit(10);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    analyses: { creator_id: string; scan_id: string; songs: { track_key: string } };
    opportunities: QualityEvidence & { id: string; title: string;
      opportunity_sources: (NonNullable<QualityEvidence["opportunity_sources"]> & {
        name: string; kind: string; source_url: string | null;
      }) | null };
  }>;
  let sent = 0;
  for (const row of rows) {
    if (qualityStatus(row.opportunities, "strong") !== "LIVE_VERIFIED") continue;
    const { data: existing, error: existingError } = await db.from("opportunity_alerts")
      .select("id").eq("match_id", row.id).limit(1);
    if (existingError) throw existingError;
    if (existing?.length) continue;
    const { data: prefs, error: prefsError } = await db.from("song_where_prefs")
      .select("alerts_enabled,unsubscribe_token").eq("creator_id", row.analyses.creator_id).limit(1);
    if (prefsError) throw prefsError;
    if (!prefs?.[0]?.alerts_enabled) continue;
    const unlocked = await unlockedScansFor(row.analyses.creator_id, [{
      scanId: row.analyses.scan_id, trackKey: row.analyses.songs.track_key,
    }]);
    if (!unlocked.has(row.analyses.scan_id)) continue;
    const { data: creators, error: creatorError } = await db.from("creators")
      .select("email").eq("id", row.analyses.creator_id).limit(1);
    if (creatorError) throw creatorError;
    const email = creators?.[0]?.email;
    if (!email) continue;
    const source = row.opportunities.opportunity_sources;
    if (source?.kind === "page") {
      const url = source.source_url ? publicHttpsUrl(source.source_url) : null;
      let current = null;
      if (url) try {
        const response = await fetch(url, { cache: "no-store", redirect: "error",
          headers: { Accept: "text/html", "User-Agent": "CHRP-SongWhere/1.0" },
          signal: AbortSignal.timeout(8000) });
        if (response.ok) current = parsePublicOpportunityPage(await response.text(), url.href);
      } catch { /* Do not alert on an unverified page. */ }
      if (!current || Date.parse(current.deadline ?? "") !== Date.parse(row.opportunities.deadline ?? "") ||
          current.submissionUrl !== row.opportunities.submission_url) {
        await db.from("opportunity_sources").update({ active: false,
          quarantine_reason: "alert_reverification_failed" }).eq("name", source.name);
        continue;
      }
    }
    // A cached route check is not sufficient evidence for a new notification.
    const verifiedAt = await verifySubmissionRoute(row.opportunities.submission_url);
    const { error: verificationError } = await db.from("opportunities")
      .update({ route_verified_at: verifiedAt }).eq("id", row.opportunities.id);
    if (verificationError) throw verificationError;
    if (!verifiedAt) continue;
    const { data: claim, error: claimError } = await db.from("opportunity_alerts")
      .insert({ match_id: row.id, status: "queued", channel: "email" })
      .select("id").single();
    if (claimError) {
      if (claimError.code === "23505") continue;
      throw claimError;
    }
    const reportUrl = `https://scan.chrp.ai/report/${encodeURIComponent(row.analyses.scan_id)}`;
    const unsubscribe = `https://scan.chrp.ai/api/song-where/unsubscribe?token=${prefs[0].unsubscribe_token}`;
    const result = await sendEmail({
      to: email,
      subject: "A new Song Where opportunity may fit your song",
      html: renderEmail({
        heading: "A new place to explore",
        body: `${escapeHtml(row.opportunities.title)} may fit the measured profile of one of your songs. Review the external listing and its rights requirements before submitting. CHRP does not represent you or guarantee placement. <a href="${unsubscribe}">Turn off Song Where alerts</a>.`,
        cta: "Review opportunity",
        ctaUrl: reportUrl,
        support: `You opted in to Song Where alerts. <a href="${unsubscribe}">Unsubscribe in one click</a>.`,
      }),
    });
    const { error: updateError } = await db.from("opportunity_alerts")
      .update({ status: result.ok ? "sent" : "failed", sent_at: result.ok ? new Date().toISOString() : null,
        error: result.ok ? null : result.reason })
      .eq("id", claim!.id);
    if (updateError) throw updateError;
    if (result.ok) sent++;
  }
  const more = rows.length === 10;
  const { error: cursorError } = await db.from("song_where_job_state")
    .upsert({ stage: "alert", cursor: more ? rows[rows.length - 1].id : null,
      updated_at: new Date().toISOString() }, { onConflict: "stage" });
  if (cursorError) throw cursorError;
  return { examined: rows.length, sent, more };
}
