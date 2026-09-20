import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import EmbeddedPostgres from "embedded-postgres";

let pg: InstanceType<typeof EmbeddedPostgres>;
let client: { connect(): Promise<void>; query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>; end(): Promise<void> };

beforeAll(async () => {
  pg = new EmbeddedPostgres({ databaseDir: `/tmp/chrp-song-where-pg-${process.pid}-${Date.now()}`,
    user: "chrp", password: "chrp", port: 55433, persistent: false });
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient() as unknown as typeof client;
  await client.connect();
  await client.query("create role anon nologin; create role authenticated nologin;");
  await client.query("create table creators (id uuid primary key); create table analyses (id uuid primary key references creators(id));");
  await client.query(readFileSync("db/migrations/0004_song_where.sql", "utf8"));
  await client.query(readFileSync("supabase/migrations/20260920143438_song_where_acquisition.sql", "utf8"));
}, 180_000);

afterAll(async () => { await client?.end(); await pg?.stop(); });

describe("Song Where migration", () => {
  it("creates only new service-only tables, with RLS on every one", async () => {
    const { rows } = await client.query(`select relname, relrowsecurity from pg_class where relname in
      ('opportunity_sources','opportunities','song_opportunity_matches','song_opportunity_match_history',
       'song_where_prefs','opportunity_alerts','submission_clicks','song_where_job_state',
       'opportunity_source_candidates','opportunity_inbox_messages') order by relname`);
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.relrowsecurity === true)).toBe(true);
    const grants = await client.query(`select has_table_privilege('authenticated', 'song_opportunity_matches', 'select') as can_read,
      has_table_privilege('anon', 'opportunities', 'select') as anon_read`);
    expect(grants.rows[0]).toMatchObject({ can_read: false, anon_read: false });
  });

  it("has no creator_id on matches and rejects duplicate analysis-opportunity pairs", async () => {
    const columns = await client.query(`select column_name from information_schema.columns
      where table_name='song_opportunity_matches'`);
    expect(columns.rows.map((row) => row.column_name)).not.toContain("creator_id");
    const { rows } = await client.query(`select count(*)::int as n from pg_constraint
      where conrelid='song_opportunity_matches'::regclass and contype='u'`);
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });
});
