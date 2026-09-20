-- Service-role-only evidence; absent evidence never becomes an artist-facing listing.
alter table opportunities
  add column route_verified_at timestamptz,
  add column applicant_count integer check (applicant_count >= 0),
  add column competition_level text check (competition_level in ('low', 'medium', 'high')),
  add column eligibility_requirements jsonb not null default '{}'::jsonb;
