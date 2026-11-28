-- The OpenAlex author id of a researcher.
--
-- The researcher is identified by a chain of signals, strongest first:
--
--   1. the OpenAlex author id - the only stable, unambiguous identifier
--      OpenAlex has, and the one every later pull depends on;
--   2. the ORCID - stable, but a researcher may never have registered
--      one;
--   3. the name plus the affiliation - the permanent fallback, because a
--      researcher may have no OpenAlex or ORCID profile at all.
--
-- Only the first two live on the profile. The third is derived on demand
-- from the account name and the hard-coded FPT University affiliation, so
-- it never needs a column.
--
-- The column is nullable and NOT unique. A researcher without an OpenAlex
-- profile leaves it null, and several researchers may share one OpenAlex
-- author entity - OpenAlex merges duplicate author profiles, so two FPT
-- researchers with the same name can end up under one id. A unique
-- constraint would refuse the second of them a legitimate profile.
BEGIN;

ALTER TABLE researcher_profiles
  ADD COLUMN openalex_author_id varchar(50);

-- The lookup that resolves a researcher by their OpenAlex author id.
CREATE INDEX idx_researcher_profiles_openalex_author
  ON researcher_profiles(openalex_author_id)
  WHERE openalex_author_id IS NOT NULL;

COMMENT ON COLUMN researcher_profiles.openalex_author_id IS 'The OpenAlex author id of the researcher, e.g. A5023888391. Set when the researcher confirms the author during onboarding. Null when the researcher has no OpenAlex profile, in which case the name plus the hard-coded FPT University affiliation is the fallback. Not unique: OpenAlex merges duplicate author profiles, so several researchers may share one id.';

COMMIT;
