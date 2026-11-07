-- Search index: per-entity helpers and a rebuild path.
--
-- The index is maintained by the trigger `sync_search_index`, which reads
-- NEW and OLD and therefore only ever sees the rows written after it
-- exists. A row written before the trigger was created, or while it was
-- missing, would stay out of the index for ever and there would be no way
-- to get it back.
--
-- This migration adds:
--
--   1. The per-entity helpers `sync_researcher_search_index`,
--      `sync_group_search_index` and `sync_opportunity_search_index`. They
--      hold the indexing rule of one entity type each and take a row id, so
--      both the trigger and the rebuild can call them. The trigger function
--      is rewritten to dispatch to them, which keeps the two paths from
--      drifting apart.
--
--   2. The function `rebuild_search_index()`, which recomputes every
--      indexable row from the source tables. It is an upsert per row, keyed
--      on (entity_type, entity_id), so running it twice leaves the same rows
--      in place. It also removes the rows that must not be indexed, so it
--      repairs an index that holds a row it should not.
--
-- The schema itself does not change: no table, column, index or constraint is
-- touched, so the Prisma datamodel is unaffected.
--
-- The functions are replaced with CREATE OR REPLACE, so the migration is
-- safe to apply on a database that already has the old versions.

-- Recomputes the OUTPUT row of the index for one work. The work's document
-- contains the author names, so every change to output_authors has to refresh
-- it; sharing a work out of the shared helper keeps both paths identical.
-- A work that is not published (or has no current release) leaves the index.
CREATE OR REPLACE FUNCTION sync_search_index_output(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  o research_outputs%ROWTYPE;
  r output_revisions%ROWTYPE;
  authors text;
BEGIN
  SELECT * INTO o FROM research_outputs WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='OUTPUT' AND entity_id=target;
    RETURN;
  END IF;
  IF o.sharing_status<>'SHARED' THEN
    DELETE FROM search_index WHERE entity_type='OUTPUT' AND entity_id=target;
    RETURN;
  END IF;
  SELECT * INTO r FROM output_revisions WHERE id=o.current_release_id;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='OUTPUT' AND entity_id=target;
    RETURN;
  END IF;
  authors := coalesce(
    (SELECT string_agg(a.author_name_string, ' ' ORDER BY a.author_order)
       FROM output_authors a WHERE a.output_id=o.id),
    coalesce((SELECT string_agg(x->>'name', ' ') FROM jsonb_array_elements(r.authors_snapshot) x
       WHERE x ? 'name'), ''));
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('OUTPUT',o.id,r.id,o.owner_id,o.visibility,o.access_group_id,
          r.title, coalesce(r.abstract,''), authors,
          to_tsvector('simple', coalesce(r.title,'') || ' ' || coalesce(r.abstract,'') || ' ' || authors))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

-- The per-entity helpers. They hold the indexing rule of one entity type
-- each, and both the maintenance trigger and the rebuild call them, so the
-- two paths cannot drift apart.
--
-- The trigger function cannot be reused for the rebuild: it is a trigger
-- function, so it reads NEW and OLD and returns NEW. These helpers take
-- the row id and work on the row itself.
--
-- A row that must not be indexed is deleted from the index rather than
-- left alone, so a helper repairs a row that was indexed by mistake.
CREATE OR REPLACE FUNCTION sync_researcher_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  u users%ROWTYPE;
  p researcher_profiles%ROWTYPE;
  etitle text;
BEGIN
  SELECT * INTO u FROM users WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=target;
    RETURN;
  END IF;
  SELECT * INTO p FROM researcher_profiles WHERE user_id=target;
  IF NOT FOUND OR p.profile_confirmed_at IS NULL OR u.is_active=false THEN
    DELETE FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=target;
    RETURN;
  END IF;
  etitle:=btrim(regexp_replace(coalesce(nullif(btrim(u.academic_title),''),'')||' '||u.full_name,'[[:space:]]+',' ','g'));
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('RESEARCHER',u.id,NULL,u.id,'FPTU_COMMUNITY',NULL,
          etitle, coalesce(p.bio,''), u.full_name,
          to_tsvector('simple', coalesce(etitle,'')||' '||coalesce(p.bio,'')||' '||coalesce(u.full_name,'')))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

CREATE OR REPLACE FUNCTION sync_group_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  g research_groups%ROWTYPE;
  etitle text;
  ebody text;
  eauthors text;
BEGIN
  SELECT * INTO g FROM research_groups WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='GROUP' AND entity_id=target;
    RETURN;
  END IF;
  IF NOT g.is_active OR g.archived_at IS NOT NULL THEN
    DELETE FROM search_index WHERE entity_type='GROUP' AND entity_id=target;
    RETURN;
  END IF;
  etitle:=g.name; ebody:=coalesce(g.description,'');
  eauthors:=coalesce((SELECT usr.full_name FROM users usr WHERE usr.id=g.lead_id),'');
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('GROUP',g.id,NULL,g.lead_id,'FPTU_COMMUNITY',NULL,
          etitle, ebody, eauthors,
          to_tsvector('simple', coalesce(etitle,'')||' '||coalesce(ebody,'')||' '||coalesce(eauthors,'')))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

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
  -- A group-scoped opportunity is visible to that group's members only;
  -- a personal one is public. The scope lives on the opportunity row.
  IF op.group_id IS NOT NULL THEN
    evis:='RESEARCH_GROUP'; egroup:=op.group_id;
  ELSE
    evis:='FPTU_COMMUNITY'; egroup:=NULL;
  END IF;
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

-- The trigger now dispatches to the per-entity helpers, which hold the rule
-- for each type. The helpers work on a row id, so the rebuild can call
-- exactly the same code.
CREATE OR REPLACE FUNCTION sync_search_index() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o research_outputs%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='output_revisions' THEN
    SELECT * INTO o FROM research_outputs WHERE id=NEW.output_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    -- Only the current release of a shared work is indexed. Any other
    -- revision leaves the index row alone.
    IF o.sharing_status<>'SHARED' OR o.current_release_id IS DISTINCT FROM NEW.id THEN RETURN NEW; END IF;
    PERFORM sync_search_index_output(o.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='research_outputs' THEN
    PERFORM sync_search_index_output(NEW.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='users' THEN
    PERFORM sync_researcher_search_index(NEW.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='researcher_profiles' THEN
    PERFORM sync_researcher_search_index(NEW.user_id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='research_groups' THEN
    PERFORM sync_group_search_index(NEW.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='research_opportunities' THEN
    PERFORM sync_opportunity_search_index(NEW.id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

-- Rebuilds the whole search index from the source tables.
--
-- The triggers keep the index up to date, but they only ever see the rows
-- written *after* they exist. A row written before the trigger was created,
-- or while the trigger was missing, would stay out of the index for ever and
-- there would be no way to get it back. This function is that way back: it
-- recomputes every indexable row from the source tables.
--
-- It calls the same per-entity helpers as the maintenance trigger, so the
-- rebuilt index is the index the triggers would have produced. Running it
-- twice leaves the same rows in place: it is an upsert per row, keyed on
-- (entity_type, entity_id).
--
-- Rows that must not be indexed are removed rather than left alone, so a
-- rebuild also repairs an index that holds a row it should not.
--
-- The function reads the source tables and writes only search_index, so it
-- never fires the maintenance triggers and never changes any other data.
CREATE OR REPLACE FUNCTION rebuild_search_index() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  -- Remove the rows that no longer belong in the index. A row that is not
  -- backed by an indexable source row is stale, whatever wrote it.
  DELETE FROM search_index s
   WHERE NOT EXISTS (
     SELECT 1 FROM research_outputs o
      WHERE s.entity_type='OUTPUT' AND o.id=s.entity_id
        AND o.sharing_status='SHARED' AND o.current_release_id IS NOT NULL)
     AND NOT EXISTS (
     SELECT 1 FROM users u JOIN researcher_profiles p ON p.user_id=u.id
      WHERE s.entity_type='RESEARCHER' AND u.id=s.entity_id
        AND u.is_active AND p.profile_confirmed_at IS NOT NULL)
     AND NOT EXISTS (
     SELECT 1 FROM research_groups g
      WHERE s.entity_type='GROUP' AND g.id=s.entity_id
        AND g.is_active AND g.archived_at IS NULL)
     AND NOT EXISTS (
     SELECT 1 FROM research_opportunities op
      WHERE s.entity_type='OPPORTUNITY' AND op.id=s.entity_id
        AND op.status='OPEN' AND op.archived_at IS NULL);

  -- Recompute every indexable row. The helper deletes the row for an entity
  -- that must not be indexed, so a draft that was indexed by mistake leaves
  -- the index here too.
  FOR r IN SELECT id FROM research_outputs LOOP
    PERFORM sync_search_index_output(r.id);
  END LOOP;
  FOR r IN SELECT id FROM users WHERE is_active LOOP
    PERFORM sync_researcher_search_index(r.id);
  END LOOP;
  FOR r IN SELECT id FROM research_groups WHERE is_active AND archived_at IS NULL LOOP
    PERFORM sync_group_search_index(r.id);
  END LOOP;
  FOR r IN SELECT id FROM research_opportunities WHERE status='OPEN' AND archived_at IS NULL LOOP
    PERFORM sync_opportunity_search_index(r.id);
  END LOOP;
END $$;
