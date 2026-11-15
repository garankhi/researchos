-- Output group affiliation without forced privacy (RES-163).
--
-- A work that belongs to a group is no longer forced to be private to that
-- group. `access_group_id` now records affiliation (whose banner the work
-- carries) while `visibility` alone decides who may read it: a
-- FPTU_COMMUNITY work with an affiliated group stays public to the whole
-- community. RESEARCH_GROUP still requires a group; PRIVATE still carries
-- none. The file and search-index scopes follow the same shape so the
-- copied scope never violates its own CHECK.
--
-- The new helper `can_change_output_visibility` lets the owner or the lead
-- of the affiliated group change visibility, so a group keeps control of
-- works under its banner.
BEGIN;

ALTER TABLE research_outputs
  DROP CONSTRAINT ck_output_access_scope;

ALTER TABLE research_outputs
  ADD CONSTRAINT ck_output_access_scope
  CHECK (
    (visibility = 'RESEARCH_GROUP' AND access_group_id IS NOT NULL)
    OR (visibility = 'FPTU_COMMUNITY')
    OR (visibility = 'PRIVATE' AND access_group_id IS NULL)
  );

ALTER TABLE output_files
  DROP CONSTRAINT ck_file_access_scope;

ALTER TABLE output_files
  ADD CONSTRAINT ck_file_access_scope
  CHECK (
    (visibility = 'RESEARCH_GROUP' AND access_group_id IS NOT NULL)
    OR (visibility = 'FPTU_COMMUNITY')
    OR (visibility = 'PRIVATE' AND access_group_id IS NULL)
  );

ALTER TABLE search_index
  DROP CONSTRAINT ck_search_index_scope;

ALTER TABLE search_index
  ADD CONSTRAINT ck_search_index_scope
  CHECK (
    (visibility = 'RESEARCH_GROUP' AND access_group_id IS NOT NULL)
    OR (visibility = 'FPTU_COMMUNITY')
    OR (visibility = 'PRIVATE' AND access_group_id IS NULL)
  );

CREATE OR REPLACE FUNCTION can_change_output_visibility(actor uuid, target uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_outputs o WHERE o.id=target
 AND (o.owner_id=actor OR (o.access_group_id IS NOT NULL AND can_manage_group(actor,o.access_group_id))));
$$;

COMMIT;
