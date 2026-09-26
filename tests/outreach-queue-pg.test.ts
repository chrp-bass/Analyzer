import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import EmbeddedPostgres from "embedded-postgres";
import {
  resolveLibraryAccess,
  type EntitlementRecord,
  type EntitlementStore,
} from "@/lib/commerce/credit-service";

/**
 * The outreach queue + claim migration against real PostgreSQL, loaded over
 * the real 0001/0002 schema and the outreach_batch_items migration:
 *
 *   - the lease never hands one row to two runs, even concurrently;
 *   - a stale lease is retaken, and one out of attempts is failed instead;
 *   - the same song cannot be queued twice;
 *   - a claim copies the report to the creator and grants the entitlement,
 *     is single use, and expires after 30 days;
 *   - after a claim, the entitlement rules (the same `resolveLibraryAccess`
 *     My Songs uses) show it unlocked for that creator and nobody else;
 *   - the new tables and the view are service-role only.
 */

interface PgClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

let pg: InstanceType<typeof EmbeddedPostgres>;
let client: PgClient;
const extra: PgClient[] = [];

async function connection(): Promise<PgClient> {
  const c = pg.getPgClient() as unknown as PgClient;
  await c.connect();
  extra.push(c);
  return c;
}

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: `/tmp/chrp-outreach-queue-pg-${process.pid}-${Date.now()}`,
    user: "chrp", password: "chrp", port: 55437, persistent: false,
  });
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient() as unknown as PgClient;
  await client.connect();
  await client.query(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
  `);
  await client.query(readFileSync("db/migrations/0001_analyzer_commerce.sql", "utf8"));
  await client.query(readFileSync("db/migrations/0002_song_memory.sql", "utf8"));
  await client.query(readFileSync("supabase/migrations/20260926160000_outreach_batch_items.sql", "utf8"));
  await client.query(readFileSync("supabase/migrations/20260926200000_outreach_queue_and_claims.sql", "utf8"));
}, 180_000);

afterAll(async () => {
  for (const c of extra) await c.end().catch(() => null);
  await client?.end();
  await pg?.stop();
});

async function queue(n: number, batch = "b") {
  for (let i = 0; i < n; i += 1) {
    await client.query(`insert into outreach_queue (batch_id, artist, track) values ($1, $2, $3)`,
      [batch, `Artist ${randomUUID()}`, `Track ${i}`]);
  }
}

async function lease(c: PgClient = client, limit = 5) {
  const { rows } = await c.query(`select * from claim_outreach_queue($1, 360, 3)`, [limit]);
  return rows as Array<{ id: string; attempts: number; status: string }>;
}

async function user(email: string): Promise<string> {
  const id = randomUUID();
  await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
  return id;
}

describe("the lease", () => {
  it("never gives the same row to two runs, even when they overlap", async () => {
    await client.query(`delete from outreach_queue`);
    await queue(8);
    const a = await connection();
    const b = await connection();
    // Hold run A's transaction open while run B leases.
    await a.query("begin");
    const first = (await a.query(`select * from claim_outreach_queue(5, 360, 3)`)).rows;
    const second = await lease(b);
    await a.query("commit");
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(3);
    const ids = new Set([...first.map((r) => r.id), ...second.map((r) => r.id)]);
    expect(ids.size).toBe(8);
    expect(await lease()).toHaveLength(0);
    const { rows } = await client.query(`select distinct status, attempts from outreach_queue`);
    expect(rows).toEqual([{ status: "processing", attempts: 1 }]);
  });

  it("retakes a row whose lease ran out, and fails one that has no attempts left", async () => {
    await client.query(`delete from outreach_queue`);
    await queue(2);
    const leased = await lease();
    await client.query(`update outreach_queue set lease_until = now() - interval '1 second' where id = $1`, [leased[0].id]);
    await client.query(`update outreach_queue set lease_until = now() - interval '1 second', attempts = 3 where id = $1`, [leased[1].id]);
    const again = await lease();
    expect(again.map((r) => r.id)).toEqual([leased[0].id]);
    expect(again[0].attempts).toBe(2);
    const { rows } = await client.query(`select status, error from outreach_queue where id = $1`, [leased[1].id]);
    expect(rows[0]).toEqual({ status: "failed", error: "lease_expired" });
  });

  it("does not queue the same song twice, whatever the casing", async () => {
    await client.query(`insert into outreach_queue (batch_id, artist, track) values ('b', 'Arum Rae', 'What Happiness Is')`);
    await expect(client.query(
      `insert into outreach_queue (batch_id, artist, track) values ('b2', 'ARUM RAE', 'what happiness is')`,
    )).rejects.toThrow(/duplicate key/);
  });
});

// ── Claims ──────────────────────────────────────────────────────────────────

const REPORT = {
  signature: "Calm at the ceiling.", rhodes: "It settles rather than activates.",
  throughline: "A song built for stillness.", placements: [{ name: "x" }],
};

/** A scored outreach song owned by the outreach identity, with a claim token. */
async function outreachSong(outreach: string, opts: { ageDays?: number } = {}) {
  const isrc = `US${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  const trackKey = `isrc-${isrc.toLowerCase()}`;
  const scanId = `scn_${trackKey}_abc123`;
  const song = (await client.query(
    `insert into songs (creator_id, title, artist_name, isrc, track_key, source)
     values ($1, 'What Happiness Is', 'Arum Rae', $2, $3, 'soundcharts') returning id`, [outreach, isrc, trackKey])).rows[0].id;
  await client.query(`insert into song_external_ids (song_id, provider, external_id) values ($1, 'isrc', $2)`, [song, isrc]);
  const analysis = (await client.query(
    `insert into analyses (creator_id, song_id, scan_id, status, epi_score, mode, scores, engine_version, source, analyzed_at)
     values ($1, $2, $3, 'complete', 43, 'Recharge', '{"calm":99}', 'chrp-epi-v2', 'soundcharts', now()) returning id`,
    [outreach, song, scanId])).rows[0].id;
  await client.query(
    `insert into reports (analysis_id, creator_id, scan_id, payload, generator_version, model)
     values ($1, $2, $3, $4, 'chrp-rhodes-v2', 'm')`, [analysis, outreach, scanId, JSON.stringify(REPORT)]);
  const token = randomUUID().replace(/-/g, "");
  await client.query(
    `insert into outreach_batch_items (batch_id, scan_id, analysis_id, requested_artist, requested_title, status,
       claim_token, claim_url, created_at)
     values ('outreach-test', $1, $2, 'Arum Rae', 'What Happiness Is', 'scored', $3, 'https://x/claim/' || $3,
       now() - make_interval(days => $4))`, [scanId, analysis, token, opts.ageDays ?? 0]);
  return { scanId, trackKey, analysis, token };
}

async function claim(token: string, creator: string) {
  const { rows } = await client.query(
    `select * from claim_outreach_item($1, $2, now() + interval '60 days', 1)`, [token, creator]);
  return rows[0] as { outcome: string; out_scan_id: string | null };
}

/** The production entitlement rules, over these tables. */
const store: EntitlementStore = {
  async findSongEntitlement(userId, scanId) {
    const { rows } = await client.query(
      `select id, user_id, offer::text, scan_id, track_limit, status::text, granted_at::text, expires_at::text
         from entitlements where user_id = $1 and offer = 'song_intelligence' and scan_id = $2 limit 1`, [userId, scanId]);
    return (rows[0] as unknown as EntitlementRecord) ?? null;
  },
  async findCreatorEntitlement() { return null; },
  async listTracks() { return []; },
  async attachTrack() { throw new Error("read only"); },
};

describe("claiming", () => {
  it("copies the report to the creator, unlocks it for them and for nobody else, and keeps the outreach copy", async () => {
    const outreach = await user("outreach-batch@chrp.ai");
    const creator = await user("artist@example.com");
    const other = await user("someone@example.com");
    const song = await outreachSong(outreach);

    expect(await claim(song.token, creator)).toMatchObject({ outcome: "claimed", out_scan_id: song.scanId });

    const mine = await client.query(
      `select a.status::text, a.epi_score, r.payload, s.title from analyses a
         join reports r on r.analysis_id = a.id join songs s on s.id = a.song_id
        where a.creator_id = $1 and a.scan_id = $2`, [creator, song.scanId]);
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({ status: "complete", epi_score: 43, title: "What Happiness Is", payload: REPORT });

    const scans = [{ scanId: song.scanId, trackKey: song.trackKey }];
    expect(Array.from(await resolveLibraryAccess(store, creator, scans))).toEqual([song.scanId]);
    expect(Array.from(await resolveLibraryAccess(store, other, scans))).toEqual([]);
    expect(Array.from(await resolveLibraryAccess(store, outreach, scans))).toEqual([]);

    // The included first report is what the claim uses; song #2 is paid.
    const ent = await client.query(`select stripe_checkout_session_id, amount_total_cents from entitlements where user_id = $1`, [creator]);
    expect(ent.rows).toEqual([{ stripe_checkout_session_id: `free_first_${creator}`, amount_total_cents: 0 }]);

    // The outreach identity still has its copy, so batch reuse keeps working.
    const kept = await client.query(`select count(*)::int n from reports where creator_id = $1 and scan_id = $2`, [outreach, song.scanId]);
    expect(kept.rows[0].n).toBe(1);

    const item = await client.query(`select claimed_at is not null as claimed, claimed_by_creator from outreach_batch_items where claim_token = $1`, [song.token]);
    expect(item.rows[0]).toEqual({ claimed: true, claimed_by_creator: creator });
    const events = await client.query(`select event, batch_id, scan_id from outreach_events where creator_id = $1`, [creator]);
    expect(events.rows).toEqual([{ event: "claimed", batch_id: "outreach-test", scan_id: song.scanId }]);
  });

  it("is single use: the claimer gets back in, anyone else is refused and gets nothing", async () => {
    const outreach = (await client.query(`select id from creators where email = 'outreach-batch@chrp.ai'`)).rows[0].id as string;
    const creator = await user("first@example.com");
    const other = await user("second@example.com");
    const song = await outreachSong(outreach);
    expect((await claim(song.token, creator)).outcome).toBe("claimed");
    expect((await claim(song.token, creator)).outcome).toBe("already_yours");
    expect((await claim(song.token, other)).outcome).toBe("used");
    const theirs = await client.query(`select count(*)::int n from analyses where creator_id = $1`, [other]);
    expect(theirs.rows[0].n).toBe(0);
    const ents = await client.query(`select count(*)::int n from entitlements where user_id = $1`, [creator]);
    expect(ents.rows[0].n).toBe(1);
  });

  it("expires 30 days after creation, and an unknown token is invalid", async () => {
    const outreach = (await client.query(`select id from creators where email = 'outreach-batch@chrp.ai'`)).rows[0].id as string;
    const creator = await user("late@example.com");
    const old = await outreachSong(outreach, { ageDays: 31 });
    expect((await claim(old.token, creator)).outcome).toBe("expired");
    const fresh = await outreachSong(outreach, { ageDays: 29 });
    expect((await claim(fresh.token, creator)).outcome).toBe("claimed");
    expect((await claim("nosuchtokennosuchtoken", creator)).outcome).toBe("invalid");
    const n = await client.query(`select count(*)::int n from analyses where creator_id = $1`, [creator]);
    expect(n.rows[0].n).toBe(1);
  });

  it("does not spend a creator's included report twice: a second claim gets its own grant", async () => {
    const outreach = (await client.query(`select id from creators where email = 'outreach-batch@chrp.ai'`)).rows[0].id as string;
    const creator = await user("two@example.com");
    const a = await outreachSong(outreach);
    const b = await outreachSong(outreach);
    await claim(a.token, creator);
    await claim(b.token, creator);
    const { rows } = await client.query(
      `select stripe_checkout_session_id s from entitlements where user_id = $1 order by granted_at, s`, [creator]);
    expect(rows.map((r) => String(r.s).split("_").slice(0, 2).join("_")).sort()).toEqual(["free_first", "outreach_claim"]);
  });
});

describe("reporting", () => {
  it("outreach_status joins queue, item and claim, and flags a later paid purchase", async () => {
    const outreach = (await client.query(`select id from creators where email = 'outreach-batch@chrp.ai'`)).rows[0].id as string;
    const creator = await user("buyer@example.com");
    const song = await outreachSong(outreach);
    const itemId = (await client.query(`select id from outreach_batch_items where claim_token = $1`, [song.token])).rows[0].id;
    await client.query(
      `insert into outreach_queue (batch_id, artist, track, instagram, segment, status, outreach_item_id)
       values ('view-test', 'View Artist', 'View Track', '@view', 'indie', 'done', $1)`, [itemId]);
    await claim(song.token, creator);

    let row = (await client.query(`select * from outreach_status where batch_id = 'view-test'`)).rows[0];
    expect(row).toMatchObject({ queue_status: "done", instagram: "@view", segment: "indie", scan_id: song.scanId,
      claimed_by_creator: creator, paid_after_claim: false });
    expect(row.claim_url).toContain(song.token);

    await client.query(
      `insert into entitlements (user_id, offer, scan_id, stripe_checkout_session_id, amount_total_cents, expires_at, granted_at)
       values ($1, 'song_intelligence', 'scn_isrc-other_abc123', 'cs_test_1', 1900, now() + interval '60 days', now() + interval '1 second')`,
      [creator]);
    row = (await client.query(`select paid_after_claim from outreach_status where batch_id = 'view-test'`)).rows[0];
    expect(row.paid_after_claim).toBe(true);
  });

  it("every new table, function and the view are service-role only", async () => {
    for (const rel of ["outreach_queue", "outreach_events", "outreach_status"]) {
      const { rows } = await client.query(`select
        has_table_privilege('anon', $1, 'select') a, has_table_privilege('authenticated', $1, 'select') b,
        has_table_privilege('service_role', $1, 'select') c`, [rel]);
      expect(rows[0]).toEqual({ a: false, b: false, c: true });
    }
    const { rows } = await client.query(`select
      has_function_privilege('authenticated', 'claim_outreach_item(text, uuid, timestamptz, integer, integer)', 'execute') a,
      has_function_privilege('anon', 'claim_outreach_queue(integer, integer, integer)', 'execute') b,
      has_function_privilege('service_role', 'claim_outreach_item(text, uuid, timestamptz, integer, integer)', 'execute') c`);
    expect(rows[0]).toEqual({ a: false, b: false, c: true });
    const rls = await client.query(`select relname, relrowsecurity from pg_class where relname in ('outreach_queue','outreach_events') order by 1`);
    expect(rls.rows.every((r) => r.relrowsecurity === true)).toBe(true);
  });
});
