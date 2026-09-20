import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestInboundBrief, type InboundBrief } from "@/lib/song-where/sources/email-intake.server";

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
    const input = JSON.parse(raw) as InboundBrief;
    return NextResponse.json(await ingestInboundBrief(input));
  } catch {
    return new Response(null, { status: 400 });
  }
}
