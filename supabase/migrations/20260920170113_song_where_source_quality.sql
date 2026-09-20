alter table opportunity_sources
  add column quality_score smallint not null default 50 check (quality_score between 0 and 100),
  add column last_quality_check_at timestamptz;

-- Private operational funnel; never exposed to browser roles.
create view song_where_source_funnel with (security_invoker = true) as
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
    and c.status in ('submitted', 'placed', 'passed')) as outcomes_known
from opportunity_sources s;

revoke all on song_where_source_funnel from anon, authenticated;
grant select on song_where_source_funnel to service_role;
