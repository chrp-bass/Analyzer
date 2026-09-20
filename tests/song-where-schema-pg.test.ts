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
  await client.query("create role anon nologin; create role authenticated nologin; create role service_role nologin;");
  await client.query("create table creators (id uuid primary key); create table analyses (id uuid primary key references creators(id));");
  await client.query(readFileSync("db/migrations/0004_song_where.sql", "utf8"));
  await client.query(readFileSync("supabase/migrations/20260920143438_song_where_acquisition.sql", "utf8"));
  await client.query(readFileSync("supabase/migrations/20260920162002_song_where_quality_gate.sql", "utf8"));
  await client.query(readFileSync("supabase/migrations/20260920170113_song_where_source_quality.sql", "utf8"));
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

  it("stores private quality evidence and rejects invalid competition counts", async () => {
    const columns = await client.query(`select column_name from information_schema.columns
      where table_name='opportunities' and column_name in
      ('route_verified_at','applicant_count','competition_level','eligibility_requirements')`);
    expect(columns.rows).toHaveLength(4);
    const constraints = await client.query(`select count(*)::int as n from pg_constraint
      where conrelid='opportunities'::regclass and conname like '%competition%' or
      conrelid='opportunities'::regclass and conname like '%applicant%'`);
    expect(Number(constraints.rows[0].n)).toBe(2);
  });

  it("keeps the source funnel private and counts discovered candidates", async () => {
    await client.query(`insert into opportunity_sources(name,kind,trust_level,base_url)
      values ('source-a','feed','verified','https://example.org');
      insert into opportunity_source_candidates(url,discovered_from,status)
      values ('https://example.org/open-calls','watchlist','quarantined');`);
    const { rows } = await client.query(`select candidates_discovered,candidates_verified,
      opportunities_ingested,routing_clicks from song_where_source_funnel`);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].candidates_discovered)).toBe(1);
    expect(Number(rows[0].opportunities_ingested)).toBe(0);
    const grants = await client.query(`select has_table_privilege('anon','song_where_source_funnel','select') as public_read`);
    expect(grants.rows[0].public_read).toBe(false);
  });
});
