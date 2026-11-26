-- Output scope and audience (RES-176 follow-up).
--
-- The scope and the audience of a work were one column, `visibility`, and
-- that conflated two different questions:
--
--   1. Where was the work posted, and who owns it? A personal post belongs
--      to its author, a group post belongs to the group, a project post
--      belongs to the project. The owner of that relation decides who may
--      change the audience.
--   2. Who may read the work? PRIVATE (the owner only), CONTAINER (the
--      narrow audience of the group or project) or FPTU_COMMUNITY (every
--      authenticated FPTU user).
--
-- Fusing them created a contradiction: a group lead could alter the
-- visibility of a personal post that merely carried the group banner. The
-- banner is affiliation, not ownership.
--
-- So the scope becomes three immutable columns - scope_type, scope_group_id,
-- scope_project_id - and the audience becomes its own column. The scope is
-- fixed at creation, because moving a work to another container would
-- silently change who may edit it.
--
-- The backfill keeps the old behaviour: a work with a group affiliation
-- becomes a GROUP-scoped work whose audience is CONTAINER, and a work
-- without one becomes PERSONAL. A work that was FPTU_COMMUNITY and carried
-- a group stays FPTU_COMMUNITY, so no live audience widens or narrows.
BEGIN;

CREATE TYPE output_scope_type AS ENUM ('PERSONAL', 'GROUP', 'PROJECT');

CREATE TYPE output_audience AS ENUM ('PRIVATE', 'CONTAINER', 'FPTU_COMMUNITY');

-- The default audience of the new posts of a group.
ALTER TABLE research_groups
  ADD COLUMN visibility output_audience NOT NULL DEFAULT 'CONTAINER';

ALTER TABLE research_outputs
  ADD COLUMN scope_type output_scope_type NOT NULL DEFAULT 'PERSONAL',
  ADD COLUMN scope_group_id uuid,
  ADD COLUMN scope_project_id uuid,
  ADD COLUMN audience output_audience NOT NULL DEFAULT 'PRIVATE';

ALTER TABLE research_outputs
  ADD CONSTRAINT fk_output_scope_group
    FOREIGN KEY (scope_group_id) REFERENCES research_groups(id) ON DELETE RESTRICT;

ALTER TABLE research_outputs
  ADD CONSTRAINT fk_output_scope_project
    FOREIGN KEY (scope_project_id) REFERENCES research_projects(id) ON DELETE RESTRICT;

ALTER TABLE search_index
  ADD COLUMN scope_type output_scope_type NOT NULL DEFAULT 'PERSONAL',
  ADD COLUMN scope_group_id uuid,
  ADD COLUMN scope_project_id uuid,
  ADD COLUMN audience output_audience NOT NULL DEFAULT 'FPTU_COMMUNITY';

-- Backfill: a work that carried a group banner is a group post, and its
-- old RESEARCH_GROUP visibility becomes the CONTAINER audience. A work with
-- no banner is personal. The old FPTU_COMMUNITY and PRIVATE audiences
-- carry over unchanged.
UPDATE research_outputs o
   SET scope_type = CASE WHEN o.access_group_id IS NULL THEN 'PERSONAL'::output_scope_type ELSE 'GROUP'::output_scope_type END,
       scope_group_id = o.access_group_id,
       audience = CASE
         WHEN o.visibility = 'RESEARCH_GROUP' THEN 'CONTAINER'::output_audience
         WHEN o.visibility = 'FPTU_COMMUNITY' THEN 'FPTU_COMMUNITY'::output_audience
         ELSE 'PRIVATE'::output_audience
       END;

-- The search index rows follow their work. The non-output rows are not
-- scoped work, so they keep the community audience.
UPDATE search_index s
   SET scope_type = 'PERSONAL', scope_group_id = NULL, scope_project_id = NULL,
       audience = 'FPTU_COMMUNITY'
 WHERE s.entity_type <> 'OUTPUT';

UPDATE search_index s
   SET scope_type = o.scope_type, scope_group_id = o.scope_group_id,
       scope_project_id = o.scope_project_id, audience = o.audience
  FROM research_outputs o
 WHERE s.entity_type = 'OUTPUT' AND s.entity_id = o.id;

-- The scope is immutable. The audience is the part that changes, and only
-- the container leads may change it.
CREATE FUNCTION guard_output_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND
   (NEW.scope_type, NEW.scope_group_id, NEW.scope_project_id)
   IS DISTINCT FROM (OLD.scope_type, OLD.scope_group_id, OLD.scope_project_id) THEN
   RAISE EXCEPTION 'Output scope is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER a_guard_output_scope BEFORE UPDATE ON research_outputs
  FOR EACH ROW EXECUTE FUNCTION guard_output_scope();

-- The old visibility column and its constraint are gone. The scope check
-- replaces it: a group post names its group, a project post names its
-- project, and a personal post names neither.
--
-- The views read the column, so they go first and are recreated below. The
-- functions that return their row types depend on them, so they go too.
DROP FUNCTION IF EXISTS visible_output_releases(actor uuid);

DROP FUNCTION IF EXISTS visible_owner_output_versions(actor uuid);

DROP VIEW IF EXISTS released_output_versions;

DROP VIEW IF EXISTS owner_output_versions;

ALTER TABLE research_outputs DROP COLUMN visibility;

ALTER TABLE research_outputs
  ADD CONSTRAINT ck_output_access_scope
  CHECK (scope_type <> 'GROUP' OR access_group_id IS NULL OR access_group_id = scope_group_id);

ALTER TABLE research_outputs
  ADD CONSTRAINT ck_output_scope
  CHECK (
    (scope_type = 'PERSONAL' AND scope_group_id IS NULL AND scope_project_id IS NULL)
    OR (scope_type = 'GROUP' AND scope_group_id IS NOT NULL AND scope_project_id IS NULL)
    OR (scope_type = 'PROJECT' AND scope_project_id IS NOT NULL)
  );

ALTER TABLE research_outputs
  ADD CONSTRAINT ck_output_audience_scope
  CHECK (scope_type <> 'PERSONAL' OR audience <> 'CONTAINER');

ALTER TABLE search_index DROP COLUMN visibility;

ALTER TABLE search_index
  ADD CONSTRAINT ck_search_index_scope
  CHECK (entity_type <> 'OUTPUT' OR (scope_type <> 'GROUP' OR access_group_id IS NULL OR access_group_id = scope_group_id));

-- The visibility lookup index went with the column it indexed.
DROP INDEX IF EXISTS idx_output_visibility_lookup;

DROP INDEX IF EXISTS idx_search_index_scope;

CREATE INDEX idx_output_audience_lookup ON research_outputs(audience, sharing_status) WHERE sharing_status = 'SHARED';
CREATE INDEX idx_output_scope_lookup ON research_outputs(scope_type, scope_group_id, scope_project_id);
CREATE INDEX idx_search_index_scope ON search_index(audience, scope_type, scope_group_id, scope_project_id);

-- The container of a work, resolved once and used by every policy below.
--
-- A group scope points at the group. A project scope points at the project,
-- and at its parent group when it has one: a project post is readable by
-- the whole group, so the group's leads manage it too.
CREATE FUNCTION output_scope_group(target uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT CASE o.scope_type
    WHEN 'GROUP' THEN o.scope_group_id
    WHEN 'PROJECT' THEN o.scope_group_id
    ELSE NULL END
  FROM research_outputs o WHERE o.id = target;
$$;

-- The audience of a work: who may read it, besides the FPTU community.
--
-- A group post is readable by the members of that group. A project post is
-- readable by the members of the project's parent group, or by the project
-- members when the project stands alone. The project lead always reads it
-- too: they own the project, and a lead who cannot read what their own
-- project produced is not a lead.
CREATE FUNCTION output_scope_audience(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM research_outputs o
    WHERE o.id = target
      AND (
        (o.scope_type = 'GROUP' AND is_group_member(actor, o.scope_group_id))
        OR (o.scope_type = 'PROJECT' AND (
          EXISTS (SELECT 1 FROM research_projects p
            WHERE p.id = o.scope_project_id AND p.lead_id = actor)
          OR (o.scope_group_id IS NOT NULL AND is_group_member(actor, o.scope_group_id))
          OR (o.scope_group_id IS NULL AND EXISTS (
            SELECT 1 FROM project_members pm
              WHERE pm.project_id = o.scope_project_id AND pm.user_id = actor)
          )
        ))
      ));
$$;

-- The container managers of a work: whoever may change its audience.
--
-- A personal post is managed by its owner. A group post is managed by the
-- group's leads. A project post is managed by the project's lead and by the
-- parent group's leads.
--
-- The affiliation plays no part here. A group lead has no say over a work
-- that merely carries their banner.
CREATE FUNCTION can_manage_output_content(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT is_researcher(actor) AND EXISTS (
    SELECT 1 FROM research_outputs o
    WHERE o.id = target
      AND (
        (o.scope_type = 'PERSONAL' AND o.owner_id = actor)
        OR (o.scope_type = 'GROUP' AND o.scope_group_id IS NOT NULL
            AND can_manage_group(actor, o.scope_group_id))
        OR (o.scope_type = 'PROJECT' AND o.scope_project_id IS NOT NULL AND (
          EXISTS (SELECT 1 FROM research_projects p
            WHERE p.id = o.scope_project_id AND p.lead_id = actor AND p.archived_at IS NULL)
          OR (o.scope_group_id IS NOT NULL AND can_manage_group(actor, o.scope_group_id))
        ))
      ));
$$;

-- The default audience of a group: the audience its new posts inherit.
--
-- A post snapshots the default when it is created, so changing the default
-- affects new posts only. A post that already exists keeps the audience it
-- was created with, and no post ever changes audience behind the back of
-- the people who can read it.
CREATE FUNCTION group_default_audience(target_group uuid) RETURNS output_audience LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT g.visibility FROM research_groups g WHERE g.id = target_group), 'CONTAINER'::output_audience);
$$;

-- Who may change the visibility of a work. The authority follows the scope.
CREATE OR REPLACE FUNCTION can_change_output_visibility(actor uuid, target uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT can_manage_output_content(actor, target);
$$;

-- Small helpers kept separate so the rules below read as one condition.
CREATE FUNCTION output_is_personal(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM research_outputs o WHERE o.id = target AND o.scope_type = 'PERSONAL');
$$;

CREATE FUNCTION output_owner_is_actor(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM research_outputs o WHERE o.id = target AND o.owner_id = actor);
$$;

-- The audiences a work may take, given its scope.
--
-- A personal post has two choices: PRIVATE (the owner-only draft) and
-- FPTU_COMMUNITY (the whole community). A container post has two as well:
-- CONTAINER (the narrow audience of the group or the project) and
-- FPTU_COMMUNITY. There is never a third layer.
CREATE FUNCTION allowed_output_audiences(target uuid) RETURNS output_audience[] LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN output_is_personal(target)
    THEN ARRAY['PRIVATE'::output_audience, 'FPTU_COMMUNITY'::output_audience]
    ELSE ARRAY['CONTAINER'::output_audience, 'FPTU_COMMUNITY'::output_audience] END;
$$;

-- Whether an actor may set a work to an audience.
--
-- The container leads set the audience of a post: they decide whether it
-- reaches the community or stays with the container. The poster never does,
-- not even for their own post inside a group - the group owns that post.
--
-- A personal post is the exception: its author is the owner of the post, so
-- the author sets its audience, freely.
CREATE FUNCTION can_set_output_audience(actor uuid, target uuid, wanted output_audience) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT is_researcher(actor) AND wanted = ANY (allowed_output_audiences(target))
    AND (
      CASE WHEN output_is_personal(target)
        THEN output_owner_is_actor(actor, target)
        ELSE can_manage_output_content(actor, target)
      END
    );
$$;

CREATE OR REPLACE FUNCTION can_view_output(actor uuid, target uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM research_outputs o JOIN users u ON u.id = actor AND u.is_active
    WHERE o.id = target AND (o.owner_id = actor OR (o.sharing_status = 'SHARED' AND
      (o.audience = 'FPTU_COMMUNITY' OR (o.audience = 'CONTAINER' AND output_scope_audience(actor, o.id))))));
$$;

-- The shared download policy. A grant is a separate rule: it opens only an
-- available Private file attached to the Article's current release, for a
-- reader who can still view the Article. It never reaches revisions pinned
-- by groups.
CREATE OR REPLACE FUNCTION can_view_output_file(actor uuid, target_file uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM output_files f JOIN research_outputs o ON o.id = f.output_id
    WHERE f.id = target_file AND f.is_available AND can_view_output(actor, o.id)
    AND (
      ((o.owner_id = actor OR (f.visibility = 'FPTU_COMMUNITY' OR (f.visibility = 'RESEARCH_GROUP' AND is_group_member(actor, f.access_group_id))))
        AND (o.owner_id = actor OR EXISTS (SELECT 1 FROM output_revision_files rf WHERE rf.file_id = f.id AND
          (rf.revision_id = o.current_release_id OR EXISTS (SELECT 1 FROM group_output_releases g WHERE g.output_id = o.id AND g.id = rf.revision_id)))))
      OR (f.visibility = 'PRIVATE'
        AND EXISTS (SELECT 1 FROM output_revision_files rf WHERE rf.file_id = f.id AND rf.revision_id = o.current_release_id)
        AND EXISTS (SELECT 1 FROM file_access_grants g WHERE g.file_id = f.id AND g.grantee_id = actor AND g.revoked_at IS NULL))
    ));
$$;

-- The search index permission filter. Mirrors can_view_output exactly: the
-- owner always sees the record, FPTU_COMMUNITY is visible to everyone, and
-- CONTAINER resolves to the scope audience of the work - the group, or the
-- parent group of a project.
CREATE OR REPLACE FUNCTION visible_search_index(actor uuid)
RETURNS SETOF search_index LANGUAGE sql STABLE AS $$
  SELECT s.* FROM search_index s
  JOIN users u ON u.id = actor AND u.is_active
  WHERE s.owner_id = actor
     OR s.entity_type <> 'OUTPUT'
     OR s.audience = 'FPTU_COMMUNITY'
     OR (s.audience = 'CONTAINER' AND (
          (s.scope_type = 'GROUP' AND is_group_member(actor, s.scope_group_id))
          OR (s.scope_type = 'PROJECT' AND (
            EXISTS (SELECT 1 FROM research_projects p
              WHERE p.id = s.scope_project_id AND p.lead_id = actor)
            OR (s.scope_group_id IS NOT NULL AND is_group_member(actor, s.scope_group_id))
            OR (s.scope_group_id IS NULL AND EXISTS (
              SELECT 1 FROM project_members pm
                WHERE pm.project_id = s.scope_project_id AND pm.user_id = actor)
            )
          ))
        ));
$$;

-- The released and owner views expose the scope and the audience, so the
-- API can report them without a second query.
CREATE VIEW released_output_versions AS
 SELECT o.id AS output_id, o.owner_id, o.doi, o.scope_type, o.scope_group_id,
   o.scope_project_id, o.audience, o.access_group_id, o.first_shared_at,
   r.id AS revision_id, r.revision_no, r.title, r.abstract, r.venue, r.publisher,
   r.publication_year, r.publication_status, r.output_type, r.external_url,
   r.authors_snapshot, r.released_at
 FROM research_outputs o JOIN output_revisions r ON (r.output_id, r.id) = (o.id, o.current_release_id)
 WHERE o.sharing_status = 'SHARED' AND r.released_at IS NOT NULL;

DROP VIEW IF EXISTS owner_output_versions;

DROP VIEW IF EXISTS owner_output_versions;

CREATE VIEW owner_output_versions AS
 SELECT o.id AS output_id, o.owner_id, o.doi, o.scope_type, o.scope_group_id,
   o.scope_project_id, o.audience, o.access_group_id, o.first_shared_at, o.import_state,
   r.id AS revision_id, r.revision_no, r.title, r.abstract, r.venue, r.publisher,
   r.publication_year, r.publication_status, r.output_type, r.external_url,
   r.authors_snapshot, r.released_at
 FROM research_outputs o
 LEFT JOIN output_revisions r ON r.output_id = o.id
   AND (r.id = o.current_release_id OR (o.current_release_id IS NULL AND r.released_at IS NULL))
 WHERE o.sharing_status <> 'SHARED' AND o.import_state <> 'CANDIDATE';

CREATE FUNCTION visible_output_releases(actor uuid)
RETURNS SETOF released_output_versions LANGUAGE sql STABLE AS $$
  SELECT r.* FROM released_output_versions r WHERE can_view_output(actor, r.output_id);
$$;

CREATE FUNCTION visible_owner_output_versions(actor uuid)
RETURNS SETOF owner_output_versions LANGUAGE sql STABLE AS $$
  SELECT r.* FROM owner_output_versions r WHERE r.owner_id = actor AND can_view_output(actor, r.output_id);
$$;

-- The index rows carry the scope and the audience of their work, so the
-- access filter needs no join back to the source table.
CREATE OR REPLACE FUNCTION sync_search_index_output(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  o research_outputs%ROWTYPE;
  r output_revisions%ROWTYPE;
  authors text;
BEGIN
  SELECT * INTO o FROM research_outputs WHERE id = target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type = 'OUTPUT' AND entity_id = target;
    RETURN;
  END IF;
  IF o.sharing_status <> 'SHARED' THEN
    DELETE FROM search_index WHERE entity_type = 'OUTPUT' AND entity_id = target;
    RETURN;
  END IF;
  SELECT * INTO r FROM output_revisions WHERE id = o.current_release_id;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type = 'OUTPUT' AND entity_id = target;
    RETURN;
  END IF;
  authors := coalesce(
    (SELECT string_agg(a.author_name_string, ' ' ORDER BY a.author_order)
       FROM output_authors a WHERE a.output_id = o.id),
    coalesce((SELECT string_agg(x->>'name', ' ') FROM jsonb_array_elements(r.authors_snapshot) x
       WHERE x ? 'name'), ''));
  INSERT INTO search_index(entity_type, entity_id, revision_id, owner_id, scope_type,
      scope_group_id, scope_project_id, audience, access_group_id, title, body, authors_text, doc)
  VALUES ('OUTPUT', o.id, r.id, o.owner_id, o.scope_type, o.scope_group_id, o.scope_project_id,
      o.audience, o.access_group_id,
      r.title, coalesce(r.abstract, ''), authors,
      to_tsvector('simple', coalesce(r.title, '') || ' ' || coalesce(r.abstract, '') || ' ' || authors))
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    revision_id = EXCLUDED.revision_id, owner_id = EXCLUDED.owner_id,
    scope_type = EXCLUDED.scope_type, scope_group_id = EXCLUDED.scope_group_id,
    scope_project_id = EXCLUDED.scope_project_id, audience = EXCLUDED.audience,
    access_group_id = EXCLUDED.access_group_id, title = EXCLUDED.title, body = EXCLUDED.body,
    authors_text = EXCLUDED.authors_text, doc = EXCLUDED.doc, updated_at = clock_timestamp();
END $$;

-- The non-output rows are not scoped work, so they keep the community
-- audience and carry no scope.
CREATE OR REPLACE FUNCTION sync_researcher_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  u users%ROWTYPE;
  p researcher_profiles%ROWTYPE;
  etitle text;
BEGIN
  SELECT * INTO u FROM users WHERE id = target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type = 'RESEARCHER' AND entity_id = target;
    RETURN;
  END IF;
  SELECT * INTO p FROM researcher_profiles WHERE user_id = target;
  IF NOT FOUND OR p.profile_confirmed_at IS NULL OR u.is_active = false THEN
    DELETE FROM search_index WHERE entity_type = 'RESEARCHER' AND entity_id = target;
    RETURN;
  END IF;
  etitle := btrim(regexp_replace(coalesce(nullif(btrim(u.academic_title), ''), '') || ' ' || u.full_name, '[[:space:]]+', ' ', 'g'));
  INSERT INTO search_index(entity_type, entity_id, revision_id, owner_id, scope_type,
      scope_group_id, scope_project_id, audience, access_group_id, title, body, authors_text, doc)
  VALUES ('RESEARCHER', u.id, NULL, u.id, 'PERSONAL', NULL, NULL, 'FPTU_COMMUNITY', NULL,
      etitle, coalesce(p.bio, ''), u.full_name,
      to_tsvector('simple', coalesce(etitle, '') || ' ' || coalesce(p.bio, '') || ' ' || coalesce(u.full_name, '')))
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    revision_id = EXCLUDED.revision_id, owner_id = EXCLUDED.owner_id,
    scope_type = EXCLUDED.scope_type, scope_group_id = EXCLUDED.scope_group_id,
    scope_project_id = EXCLUDED.scope_project_id, audience = EXCLUDED.audience,
    access_group_id = EXCLUDED.access_group_id, title = EXCLUDED.title, body = EXCLUDED.body,
    authors_text = EXCLUDED.authors_text, doc = EXCLUDED.doc, updated_at = clock_timestamp();
END $$;

CREATE OR REPLACE FUNCTION sync_group_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  g research_groups%ROWTYPE;
  etitle text;
  ebody text;
  eauthors text;
BEGIN
  SELECT * INTO g FROM research_groups WHERE id = target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type = 'GROUP' AND entity_id = target;
    RETURN;
  END IF;
  IF NOT g.is_active OR g.archived_at IS NOT NULL THEN
    DELETE FROM search_index WHERE entity_type = 'GROUP' AND entity_id = target;
    RETURN;
  END IF;
  etitle := g.name; ebody := coalesce(g.description, '');
  eauthors := coalesce((SELECT usr.full_name FROM users usr WHERE usr.id = g.lead_id), '');
  INSERT INTO search_index(entity_type, entity_id, revision_id, owner_id, scope_type,
      scope_group_id, scope_project_id, audience, access_group_id, title, body, authors_text, doc)
  VALUES ('GROUP', g.id, NULL, g.lead_id, 'PERSONAL', NULL, NULL, 'FPTU_COMMUNITY', NULL,
      etitle, ebody, eauthors,
      to_tsvector('simple', coalesce(etitle, '') || ' ' || coalesce(ebody, '') || ' ' || coalesce(eauthors, '')))
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    revision_id = EXCLUDED.revision_id, owner_id = EXCLUDED.owner_id,
    scope_type = EXCLUDED.scope_type, scope_group_id = EXCLUDED.scope_group_id,
    scope_project_id = EXCLUDED.scope_project_id, audience = EXCLUDED.audience,
    access_group_id = EXCLUDED.access_group_id, title = EXCLUDED.title, body = EXCLUDED.body,
    authors_text = EXCLUDED.authors_text, doc = EXCLUDED.doc, updated_at = clock_timestamp();
END $$;

CREATE OR REPLACE FUNCTION sync_opportunity_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  op research_opportunities%ROWTYPE;
  eaud output_audience;
  egroup uuid;
  etitle text;
  ebody text;
  eauthors text;
BEGIN
  SELECT * INTO op FROM research_opportunities WHERE id = target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type = 'OPPORTUNITY' AND entity_id = target;
    RETURN;
  END IF;
  IF op.status <> 'OPEN' OR op.archived_at IS NOT NULL THEN
    DELETE FROM search_index WHERE entity_type = 'OPPORTUNITY' AND entity_id = target;
    RETURN;
  END IF;
  -- An opportunity is a public job posting. The group that published it
  -- wants to attract people from outside the group, so the scope of the
  -- record does not narrow who may read it: a group-scoped opportunity is
  -- as public as a personal one. The scope still lives on the row, but it
  -- describes who published it, not who may see it.
  eaud := 'FPTU_COMMUNITY'; egroup := NULL;
  etitle := op.title; ebody := coalesce(op.description, '');
  eauthors := coalesce((SELECT usr.full_name FROM users usr WHERE usr.id = op.creator_id), '');
  INSERT INTO search_index(entity_type, entity_id, revision_id, owner_id, scope_type,
      scope_group_id, scope_project_id, audience, access_group_id, title, body, authors_text, doc)
  VALUES ('OPPORTUNITY', op.id, NULL, op.creator_id, 'PERSONAL', NULL, NULL, eaud, egroup,
      etitle, ebody, eauthors,
      to_tsvector('simple', coalesce(etitle, '') || ' ' || coalesce(ebody, '') || ' ' || coalesce(eauthors, '')))
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    revision_id = EXCLUDED.revision_id, owner_id = EXCLUDED.owner_id,
    scope_type = EXCLUDED.scope_type, scope_group_id = EXCLUDED.scope_group_id,
    scope_project_id = EXCLUDED.scope_project_id, audience = EXCLUDED.audience,
    access_group_id = EXCLUDED.access_group_id, title = EXCLUDED.title, body = EXCLUDED.body,
    authors_text = EXCLUDED.authors_text, doc = EXCLUDED.doc, updated_at = clock_timestamp();
END $$;

COMMENT ON COLUMN research_groups.visibility IS 'The default audience of the new posts of a group. CONTAINER keeps them for the members, FPTU_COMMUNITY opens them to the whole community. A post keeps the audience it was created with, so changing this affects new posts only.';

COMMENT ON COLUMN research_outputs.scope_type IS 'The posting context of the work: PERSONAL (its author owns it), GROUP (the group owns it), PROJECT (the project owns it). It decides who may change the audience and it never changes after creation, because moving a work to another container would silently change who may edit it.';

COMMENT ON COLUMN research_outputs.scope_group_id IS 'The group the work was posted in. For a GROUP scope it is the group itself; for a PROJECT scope it is the parent group, when the project has one. A project post is readable by the whole group, so the group leads manage it too.';

COMMENT ON COLUMN research_outputs.scope_project_id IS 'The project the work was posted in. Set only for a PROJECT scope.';

COMMENT ON COLUMN research_outputs.audience IS 'Who may read the work. CONTAINER resolves to the group, or to the parent group of a project. The group default is snapshotted here when the work is created, and a post keeps the audience it was created with.';

COMMENT ON COLUMN research_outputs.access_group_id IS 'The group whose banner the work carries. Display information only: it grants no authority over the work.';

COMMENT ON TABLE research_outputs IS 'One work regardless of authors/groups. DRAFT/SHARED/ARCHIVED describe internal sharing, not journal publication. Owner plus effective researcher access is required to edit/release. The scope (scope_type, scope_group_id, scope_project_id) says where the work was posted and who owns it; the audience says who may read it. Current audience applies to ALL versions and linked groups; a group link never widens access. Discovery uses released_output_versions, not drafts.';

COMMENT ON TABLE search_index IS 'Search index for the Search screen, covering four entity types: OUTPUT, RESEARCHER, GROUP, OPPORTUNITY. A plain table, not a materialized view, so a publish is visible immediately instead of waiting for a refresh schedule. Triggers maintain it: sync_search_index upserts on the source rows, sync_search_index_delete removes the row when the source is deleted, guard_search_index_entity checks the polymorphic entity reference (entity_id has no foreign key because it points at four different tables). Only the current released revision of a SHARED output is indexed; an accepted but unpublished work stays out of Search and remains visible only in the owner profile. scope_type/scope_group_id/scope_project_id/audience are copied here so access filtering needs no join back to the source table. The document contains the author names, so a change to output_authors has to rebuild it (trigger sync_search_index_authors); deleting a researcher profile removes its index row even when the account is retained (trigger sync_search_index_profile_del). visible_search_index applies the same active-account requirement as can_view_output, so an unknown, NULL or inactive actor sees nothing.';

COMMENT ON COLUMN search_index.access_group_id IS 'The group whose banner the row carries. Display information only: it grants no authority over the work. An opportunity is a public posting, so its index row is always FPTU_COMMUNITY and this column stays NULL for it.';

COMMIT;
