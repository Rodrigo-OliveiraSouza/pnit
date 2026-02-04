ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS household_size integer,
  ADD COLUMN IF NOT EXISTS children_count integer,
  ADD COLUMN IF NOT EXISTS elderly_count integer,
  ADD COLUMN IF NOT EXISTS pcd_count integer,
  ADD COLUMN IF NOT EXISTS neighborhood text;

ALTER TABLE map_points
  ADD COLUMN IF NOT EXISTS area_type text,
  ADD COLUMN IF NOT EXISTS reference_point text;

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS families_count integer,
  ADD COLUMN IF NOT EXISTS organization_type text,
  ADD COLUMN IF NOT EXISTS leader_name text,
  ADD COLUMN IF NOT EXISTS leader_contact text,
  ADD COLUMN IF NOT EXISTS activities text,
  ADD COLUMN IF NOT EXISTS meeting_frequency text;

ALTER TABLE resident_profiles
  ADD COLUMN IF NOT EXISTS energy_access text,
  ADD COLUMN IF NOT EXISTS water_supply text,
  ADD COLUMN IF NOT EXISTS water_treatment text,
  ADD COLUMN IF NOT EXISTS sewage_type text,
  ADD COLUMN IF NOT EXISTS garbage_collection text,
  ADD COLUMN IF NOT EXISTS internet_access boolean,
  ADD COLUMN IF NOT EXISTS transport_access boolean,
  ADD COLUMN IF NOT EXISTS health_unit_distance_km numeric(8,2),
  ADD COLUMN IF NOT EXISTS health_travel_time text,
  ADD COLUMN IF NOT EXISTS health_has_regular_service boolean,
  ADD COLUMN IF NOT EXISTS health_has_ambulance boolean,
  ADD COLUMN IF NOT EXISTS health_difficulties text,
  ADD COLUMN IF NOT EXISTS education_has_internet boolean,
  ADD COLUMN IF NOT EXISTS income_contributors integer,
  ADD COLUMN IF NOT EXISTS income_occupation_type text,
  ADD COLUMN IF NOT EXISTS income_has_social_program boolean,
  ADD COLUMN IF NOT EXISTS income_social_program text,
  ADD COLUMN IF NOT EXISTS housing_material text,
  ADD COLUMN IF NOT EXISTS housing_has_bathroom boolean,
  ADD COLUMN IF NOT EXISTS housing_has_water_treated boolean,
  ADD COLUMN IF NOT EXISTS housing_condition text,
  ADD COLUMN IF NOT EXISTS housing_risks text,
  ADD COLUMN IF NOT EXISTS security_has_guard boolean,
  ADD COLUMN IF NOT EXISTS security_occurrences text,
  ADD COLUMN IF NOT EXISTS participation_types text,
  ADD COLUMN IF NOT EXISTS participation_events text,
  ADD COLUMN IF NOT EXISTS participation_engagement text,
  ADD COLUMN IF NOT EXISTS demand_priorities text,
  ADD COLUMN IF NOT EXISTS photo_types text,
  ADD COLUMN IF NOT EXISTS vulnerability_level text,
  ADD COLUMN IF NOT EXISTS technical_issues text,
  ADD COLUMN IF NOT EXISTS referrals text,
  ADD COLUMN IF NOT EXISTS agencies_contacted text,
  ADD COLUMN IF NOT EXISTS consent_accepted boolean;
