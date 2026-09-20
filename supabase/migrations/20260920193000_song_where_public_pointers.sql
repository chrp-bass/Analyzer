-- Public pointers contain factual metadata only; no brief body is stored.
alter table opportunity_sources drop constraint if exists opportunity_sources_kind_check;
alter table opportunity_sources add constraint opportunity_sources_kind_check
  check (kind in ('api', 'feed', 'newsletter', 'curated', 'page'));
alter table opportunities
  add column if not exists eligibility_text text,
  add column if not exists fetched_at timestamptz,
  add column if not exists verification_status text not null default 'unverified';
