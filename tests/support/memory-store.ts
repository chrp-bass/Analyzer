import type {
  AttachInput,
  EntitlementRecord,
  EntitlementStore,
  TrackRecord,
} from "@/lib/commerce/credit-service";

/**
 * An in-memory `EntitlementStore` that mirrors the guarantees Postgres gives
 * us in 0002_song_memory.sql:
 *
 *   * rows are scoped to a user, so one creator can never see another's;
 *   * (entitlement_id, track_key) is unique, so a duplicate attach is a
 *     no-op that reports `inserted: false` rather than a second credit.
 *
 * The rules under test are the same functions production runs — only the
 * storage differs — so these assertions are evidence about real behaviour.
 */
export class InMemoryEntitlementStore implements EntitlementStore {
  entitlements: EntitlementRecord[] = [];
  tracks: TrackRecord[] = [];
  /** Counts real inserts, so tests can assert nothing was spent. */
  insertCount = 0;

  addEntitlement(row: EntitlementRecord): EntitlementRecord {
    this.entitlements.push(row);
    return row;
  }

  async findSongEntitlement(
    userId: string,
    scanId: string,
  ): Promise<EntitlementRecord | null> {
    return (
      this.entitlements.find(
        (e) =>
          e.user_id === userId &&
          e.offer === "song_intelligence" &&
          e.scan_id === scanId,
      ) ?? null
    );
  }

  async findCreatorEntitlement(
    userId: string,
  ): Promise<EntitlementRecord | null> {
    const rows = this.entitlements
      .filter(
        (e) => e.user_id === userId && e.offer === "creator_intelligence",
      )
      .sort((a, b) => (a.granted_at < b.granted_at ? 1 : -1));
    return rows[0] ?? null;
  }

  async listTracks(entitlementId: string): Promise<TrackRecord[]> {
    return this.tracks.filter((t) => t.entitlement_id === entitlementId);
  }

  async attachTrack(input: AttachInput): Promise<{ inserted: boolean }> {
    const exists = this.tracks.some(
      (t) =>
        t.entitlement_id === input.entitlementId &&
        t.track_key === input.trackKey,
    );
    if (exists) return { inserted: false };

    this.tracks.push({
      entitlement_id: input.entitlementId,
      track_key: input.trackKey,
      scan_id: input.scanId,
      analysis_id: input.analysisId ?? null,
      attached_at: new Date().toISOString(),
    });
    this.insertCount += 1;
    return { inserted: true };
  }
}

const DAY = 86_400_000;

export function creatorEntitlement(
  userId: string,
  opts: Partial<EntitlementRecord> = {},
): EntitlementRecord {
  const now = Date.now();
  return {
    id: `ent_creator_${userId}`,
    user_id: userId,
    offer: "creator_intelligence",
    scan_id: null,
    track_limit: 10,
    status: "active",
    granted_at: new Date(now).toISOString(),
    expires_at: new Date(now + 365 * DAY).toISOString(),
    ...opts,
  };
}

export function songEntitlement(
  userId: string,
  scanId: string,
  opts: Partial<EntitlementRecord> = {},
): EntitlementRecord {
  const now = Date.now();
  return {
    id: `ent_song_${userId}_${scanId}`,
    user_id: userId,
    offer: "song_intelligence",
    scan_id: scanId,
    track_limit: 1,
    status: "active",
    granted_at: new Date(now).toISOString(),
    expires_at: new Date(now + 60 * DAY).toISOString(),
    ...opts,
  };
}
