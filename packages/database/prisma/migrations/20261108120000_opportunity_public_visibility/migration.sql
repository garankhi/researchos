-- An opportunity is a public job posting.
--
-- The previous version of `sync_opportunity_search_index` filed a
-- group-scoped opportunity under `RESEARCH_GROUP` and copied the group into
-- `access_group_id`. `visible_search_index` then filtered it by
-- `is_group_member`, so a group's posting was only listed to the members of
-- that group.
--
-- That is the wrong rule. A group publishes an opportunity to attract
-- people from outside the group, so the scope of the record describes who
-- published it, not who may read it. The API already reads every non-draft
-- opportunity for every signed-in researcher; this migration makes the
-- search index agree with it.
--
-- The function is replaced rather than edited, because the baseline SQL is
-- the source of truth and this migration has to carry the same definition
-- for a database that never ran the baseline.
--
-- The rows that are already indexed keep their old scope until they are
-- written again or the index is rebuilt, so the migration reindexes the
-- opportunities it can reach.
BEGIN;

CREATE OR REPLACE FUNCTION sync_opportunity_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  op research_opportunities%ROWTYPE;
  evis visibility_level;
  egroup uuid;
  etitle text;
  ebody text;
  eauthors text;
BEGIN
  SELECT * INTO op FROM research_opportunities WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='OPPORTUNITY' AND entity_id=target;
    RETURN;
  END IF;
  IF op.status<>'OPEN' OR op.archived_at IS NOT NULL THEN
    DELETE FROM search_index WHERE entity_type='OPPORTUNITY' AND entity_id=target;
    RETURN;
  END IF;
  -- An opportunity is a public job posting. The group that published it
  -- wants to attract people from outside the group, so the scope of the
  -- record does not narrow who may read it: a group-scoped opportunity is
  -- as public as a personal one. The scope still lives on the row, but it
  -- describes who published it, not who may see it.
  evis:='FPTU_COMMUNITY'; egroup:=NULL;
  etitle:=op.title; ebody:=coalesce(op.description,'');
  eauthors:=coalesce((SELECT usr.full_name FROM users usr WHERE usr.id=op.creator_id),'');
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('OPPORTUNITY',op.id,NULL,op.creator_id,evis,egroup,
          etitle, ebody, eauthors,
          to_tsvector('simple', coalesce(etitle,'')||' '||coalesce(ebody,'')||' '||coalesce(eauthors,'')))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

-- The rows that are already indexed still carry the old scope, because the
-- trigger only sees the rows written after it exists. Reindexing the
-- opportunities that are indexable puts them back in line with the rule.
--
-- The opportunities that are no longer indexable are removed by the same
-- helper, so calling it for every opportunity leaves the index exactly as
-- the trigger would have written it.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM research_opportunities LOOP
    PERFORM sync_opportunity_search_index(r.id);
  END LOOP;
END $$;

COMMIT;
