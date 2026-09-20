-- Default existing opportunities to GENERAL until independently reclassified by ingestion.
alter table opportunities
  add column specificity_tier text not null default 'C'
    check (specificity_tier in ('A', 'B', 'C')),
  add column song_matchable boolean not null default false,
  add constraint opportunities_song_matchable_requires_a
    check (not song_matchable or specificity_tier = 'A');

-- The service-only funnel connects source quality to tier, match and route outcomes.
create or replace view song_where_source_funnel with (security_invoker = true) as
select s.id as source_id, s.failure_count,
  (select count(*) from opportunity_source_candidates c
    where s.base_url is not null and c.url like s.base_url || '%') as candidates_discovered,
  (select count(*) from opportunity_source_candidates c
    where s.base_url is not null and c.url like s.base_url || '%' and c.status = 'admitted') as candidates_verified,
  (select count(*) from opportunities o where o.source_id = s.id and not o.synthetic) as opportunities_ingested,
  (select count(*) from opportunities o where o.source_id = s.id and not o.synthetic
    and o.status = 'open' and o.deadline > now() and o.route_verified_at > now() - interval '24 hours') as actionable,
  (select count(*) from opportunities o where o.source_id = s.id and not o.synthetic
    and (o.status <> 'open' or o.deadline <= now())) as stale,
  (select count(*) from song_opportunity_matches m join opportunities o on o.id = m.opportunity_id
    where o.source_id = s.id) as matches,
  (select count(*) from submission_clicks c join song_opportunity_matches m on m.id = c.match_id
    join opportunities o on o.id = m.opportunity_id where o.source_id = s.id) as routing_clicks,
  (select count(*) from submission_clicks c join song_opportunity_matches m on m.id = c.match_id
    join opportunities o on o.id = m.opportunity_id where o.source_id = s.id
    and c.status in ('submitted', 'placed', 'passed')) as outcomes_known,
  (select count(*) from opportunities o where o.source_id = s.id and not o.synthetic
    and o.status = 'open' and o.deadline > now() and o.specificity_tier = 'A') as tier_a,
  (select count(*) from opportunities o where o.source_id = s.id and not o.synthetic
    and o.status = 'open' and o.deadline > now() and o.specificity_tier = 'B') as tier_b,
  (select count(*) from opportunities o where o.source_id = s.id and not o.synthetic
    and o.status = 'open' and o.deadline > now() and o.specificity_tier = 'C') as tier_c,
  (select count(*) from opportunities o where o.source_id = s.id and not o.synthetic
    and o.status = 'open' and o.deadline > now() and o.song_matchable) as matchable
from opportunity_sources s;

revoke all on song_where_source_funnel from anon, authenticated;
grant select on song_where_source_funnel to service_role;
