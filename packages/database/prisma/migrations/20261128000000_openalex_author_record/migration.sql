-- The OpenAlex author record of a researcher, in three layers.
--
-- The OpenAlex author payload is wide: an identity, a set of identifiers,
-- a list of affiliations, a set of counts, a set of topics and a yearly
-- breakdown. Storing it in one column would make it impossible to query,
-- and spreading it across the existing profile columns would bury the
-- fields that are not profile fields.
--
-- So the record is split by how it is used:
--
--   1. The counts go on the profile as columns. They are read on every
--      profile view, and they are scalars.
--   2. The observed byline names get their own table. The set is what
--      the name-based identity resolution matches against, and it is
--      queried rather than displayed.
--   3. The affiliations get their own table, with the years they held.
--      The years are the point: a year at FPT University is the
--      platform's business, and a year at another institution is not. A
--      single "last known institution" column cannot answer that, and
--      OpenAlex's own "last known" is the latest authorship rather than
--      the current employment - it regularly points at an institution the
--      researcher has left.
--   4. The raw payload is kept whole in a jsonb snapshot, so the parts
--      the platform does not model yet - the topics, the yearly counts,
--      the award links - survive without a migration every time OpenAlex
--      adds a field.
--
-- The profile columns are nullable: a researcher without an OpenAlex
-- profile has none of them.
BEGIN;

CREATE TYPE institution_type AS ENUM (
  'EDUCATION',
  'COMPANY',
  'HEALTHCARE',
  'NONPROFIT',
  'GOVERNMENT',
  'FACILITY',
  'ARCHIVE',
  'OTHER'
);

ALTER TABLE researcher_profiles
  ADD COLUMN openalex_display_name varchar(255),
  ADD COLUMN openalex_works_count integer,
  ADD COLUMN openalex_cited_by_count integer,
  ADD COLUMN openalex_h_index integer,
  ADD COLUMN openalex_i10_index integer,
  ADD COLUMN openalex_2yr_mean_citedness double precision,
  ADD COLUMN openalex_synced_at timestamptz;

ALTER TABLE researcher_profiles
  ADD CONSTRAINT ck_profile_openalex_counts CHECK (
    (openalex_works_count IS NULL OR openalex_works_count >= 0)
    AND (openalex_cited_by_count IS NULL OR openalex_cited_by_count >= 0)
    AND (openalex_h_index IS NULL OR openalex_h_index >= 0)
    AND (openalex_i10_index IS NULL OR openalex_i10_index >= 0)
  );

-- The byline spellings OpenAlex has observed for a researcher.
CREATE TABLE researcher_author_names (
  id uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  user_id uuid NOT NULL,
  name varchar(255) NOT NULL,
  is_canonical boolean NOT NULL DEFAULT false,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- The institutions a researcher was affiliated with, and the years.
CREATE TABLE researcher_affiliations (
  id uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  user_id uuid NOT NULL,
  institution_id varchar(255) NOT NULL,
  ror varchar(255),
  name varchar(255) NOT NULL,
  country_code varchar(2),
  institution_type institution_type,
  year_start smallint,
  year_end smallint,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT ck_affiliation_years CHECK (
    (year_start IS NULL OR year_start > 0)
    AND (year_end IS NULL OR year_end > 0)
    AND (year_start IS NULL OR year_end IS NULL OR year_start <= year_end)
  )
);

-- The raw OpenAlex author payload, kept whole.
CREATE TABLE researcher_openalex_snapshots (
  user_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT ck_openalex_snapshot_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE UNIQUE INDEX uq_researcher_author_names_user_name
  ON researcher_author_names(user_id, name);

CREATE INDEX idx_researcher_author_names_user
  ON researcher_author_names(user_id);

CREATE UNIQUE INDEX uq_researcher_affiliations_user_institution
  ON researcher_affiliations(user_id, institution_id);

CREATE INDEX idx_researcher_affiliations_user
  ON researcher_affiliations(user_id);

CREATE INDEX idx_researcher_affiliations_institution
  ON researcher_affiliations(institution_id);

ALTER TABLE researcher_author_names
  ADD CONSTRAINT fk_researcher_author_names_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE researcher_affiliations
  ADD CONSTRAINT fk_researcher_affiliations_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE researcher_openalex_snapshots
  ADD CONSTRAINT fk_researcher_openalex_snapshots_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMENT ON COLUMN researcher_profiles.openalex_display_name IS 'The canonical display name OpenAlex holds for the author. Kept apart from users.full_name: the account name is what the researcher types, this one is what the source says, and they differ often enough that overwriting one with the other loses information.';

COMMENT ON COLUMN researcher_profiles.openalex_h_index IS 'The h-index OpenAlex reports for the author. Career-lifetime, so it favours a long career over a hot recent topic; openalex_2yr_mean_citedness is the recency-weighted counterpart.';

COMMENT ON COLUMN researcher_profiles.openalex_i10_index IS 'The number of works with at least ten citations, as OpenAlex reports it.';

COMMENT ON COLUMN researcher_profiles.openalex_2yr_mean_citedness IS 'The mean citations per work over the last two years. Recency-weighted, so it says how much the author is cited now rather than how much they ever were.';

COMMENT ON COLUMN researcher_profiles.openalex_synced_at IS 'When the OpenAlex author payload was last fetched for this researcher. Null when it never was.';

COMMENT ON TABLE researcher_author_names IS 'The byline spellings OpenAlex has observed for a researcher. One row per spelling; is_canonical marks the one OpenAlex calls the display name. The set is what the name-based identity resolution matches against, and it has to be a table because it is queried rather than displayed. The names are the source spelling, not normalised - normalisation happens when they are compared.';

COMMENT ON TABLE researcher_affiliations IS 'The institutions a researcher was affiliated with, and the years they were there. The year range is what makes an affiliation decidable: a year at FPT University is the platform''s business, a year at another institution is not. is_primary marks the affiliation the researcher is at now. institution_id is the OpenAlex institution id and ror is the same institution under its ROR id, which survives the renames and merges that break a display name.';

COMMENT ON TABLE researcher_openalex_snapshots IS 'The raw OpenAlex author payload for a researcher, kept whole. The structured columns cover what the platform queries on - the counts on the profile, the names and the affiliations in their own tables - and this snapshot keeps the rest (the topics, the yearly counts, the award links) without a migration every time OpenAlex adds a field. One row per researcher: the last fetch wins.';

COMMIT;
