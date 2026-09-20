import { songWhereEnabled } from "@/lib/song-where/config.server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!songWhereEnabled()) return new Response(null, { status: 404 });
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return new Response(null, { status: 404 });
  try {
    const { error } = await createAdminClient().from("song_where_prefs")
      .update({ alerts_enabled: false, updated_at: new Date().toISOString() })
      .eq("unsubscribe_token", token);
    if (error) throw error;
    return new Response("Song Where alerts are off. Your reports remain available.", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    console.error("[song-where] unsubscribe failed");
    return new Response(null, { status: 503 });
  }
}
