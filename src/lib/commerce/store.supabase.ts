import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AttachInput,
  EntitlementRecord,
  EntitlementStore,
  TrackRecord,
} from "@/lib/commerce/credit-service";

/**
 * The production `EntitlementStore`: Postgres, reached with the service-role
 * key from server code only.
 *
 * Service role bypasses RLS, which is exactly why every method here filters
 * on `user_id` explicitly. RLS is the second line; these predicates are the
 * first. A caller can only ever be handed rows belonging to the identity the
 * session cookie proved.
 */

const ENTITLEMENT_COLUMNS =
  "id,user_id,offer,scan_id,track_limit,status,granted_at,expires_at";

type Db = ReturnType<typeof createAdminClient>;

export function createSupabaseEntitlementStore(db: Db = createAdminClient()): EntitlementStore {
  return {
    async findSongEntitlement(userId, scanId) {
      const { data } = await db
        .from("entitlements")
        .select(ENTITLEMENT_COLUMNS)
        .eq("user_id", userId)
        .eq("offer", "song_intelligence")
        .eq("scan_id", scanId)
        .limit(1);
      return (data?.[0] as EntitlementRecord | undefined) ?? null;
    },

    async findCreatorEntitlement(userId) {
      // Newest first: a creator who bought a second catalog year should be
      // judged against the entitlement they most recently paid for.
      const { data } = await db
        .from("entitlements")
        .select(ENTITLEMENT_COLUMNS)
        .eq("user_id", userId)
        .eq("offer", "creator_intelligence")
        .order("granted_at", { ascending: false })
        .limit(1);
      return (data?.[0] as EntitlementRecord | undefined) ?? null;
    },

    async listTracks(entitlementId) {
      const { data } = await db
        .from("entitlement_tracks")
        .select("entitlement_id,track_key,scan_id,analysis_id,attached_at")
        .eq("entitlement_id", entitlementId);
      return (data as TrackRecord[] | null) ?? [];
    },

    async attachTrack(input: AttachInput) {
      const { error } = await db.from("entitlement_tracks").insert({
        entitlement_id: input.entitlementId,
        track_key: input.trackKey,
        scan_id: input.scanId,
        track_slug: input.trackKey,
        analysis_id: input.analysisId ?? null,
      });

      if (!error) return { inserted: true };

      // 23505 = unique_violation. The song was already attached — either by
      // an earlier request or by a concurrent one that won the race. Either
      // way the creator is entitled and exactly one credit was spent.
      if (isUniqueViolation(error)) return { inserted: false };
      throw error;
    },
  };
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" ||
    `${error.message ?? ""}`.toLowerCase().includes("duplicate key")
  );
}
