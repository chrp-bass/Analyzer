import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestInboundBrief, type InboundBrief } from "@/lib/song-where/sources/email-intake.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestCreatorBrief } from "@/lib/song-where/creator-brief.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.SONG_WHERE_INBOUND_SECRET;
  if (!secret || secret.length < 32) return new Response(null, { status: 503 });
  const raw = await request.text();
  if (raw.length > 60_000) return new Response(null, { status: 413 });
  const supplied = request.headers.get("x-chrp-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))) {
    return new Response(null, { status: 403 });
  }
  try {
    const input = JSON.parse(raw) as InboundBrief & { recipient?: string };
    if (input.recipient?.toLowerCase() === "briefs@chrp.ai") {
      if (process.env.SONG_WHERE_PRIVATE_ENABLED !== "true" || !input.dkimPass || !input.spfPass)
        return new Response(null, { status: 403 });
      const sender = input.from?.match(/<?([^<>\s]+@[^<>\s]+)>?$/)?.[1]?.toLowerCase();
      if (!sender || !input.messageId || !Number.isFinite(Date.parse(input.receivedAt)))
        return new Response(null, { status: 400 });
      const db = createAdminClient();
      const { data: creators, error } = await db.from("creators")
        .select("id").eq("email", sender).limit(1);
      if (error) throw error;
      if (!creators?.[0]) return new Response(null, { status: 403 });
      const { data: seen, error: seenError } = await db.from("opportunity_inbox_messages")
        .select("id").eq("provider_message_id", input.messageId).limit(1);
      if (seenError) throw seenError;
      if (seen?.length) return NextResponse.json({ status: "duplicate" });
      const result = await ingestCreatorBrief(db, creators[0].id, input);
      const { error: ledgerError } = await db.from("opportunity_inbox_messages").insert({
        provider_message_id: input.messageId, creator_id: creators[0].id,
        sender: sender, subject: input.subject.slice(0, 300),
        received_at: new Date(input.receivedAt).toISOString(),
        status: result.status === "stored" ? "normalized" : "quarantined",
        reason: result.status === "stored" ? null : "private_brief_not_verifiable",
      });
      if (ledgerError) throw ledgerError;
      return NextResponse.json(result);
    }
    return NextResponse.json(await ingestInboundBrief(input));
  } catch {
    return new Response(null, { status: 400 });
  }
}
