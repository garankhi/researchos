BEGIN;

ALTER TABLE group_members ADD COLUMN archived_at timestamptz;
ALTER TABLE group_directions ADD COLUMN archived_at timestamptz;
CREATE INDEX group_members_active_user_idx ON group_members (user_id, group_id) WHERE archived_at IS NULL;
CREATE INDEX group_directions_active_group_idx ON group_directions (group_id, created_at) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION is_group_member(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM research_groups g JOIN users u ON u.id=actor AND u.is_active
 WHERE g.id=target AND g.is_active AND g.archived_at IS NULL AND
 (g.lead_id=actor OR EXISTS (SELECT 1 FROM group_members m
   WHERE m.group_id=g.id AND m.user_id=actor AND m.archived_at IS NULL)));
$$;

-- Project scope is controlled by the active project's lead, never by creator
-- or group-manager shortcuts. Group-only scope follows current group roles.
CREATE OR REPLACE FUNCTION can_manage_opportunity(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (
   SELECT 1 FROM research_opportunities o WHERE o.id=target AND CASE
     WHEN o.project_id IS NOT NULL THEN EXISTS (
       SELECT 1 FROM research_projects p WHERE p.id=o.project_id
         AND p.lead_id=actor AND p.archived_at IS NULL
         AND p.group_id IS NOT DISTINCT FROM o.group_id
         AND (o.group_id IS NULL OR EXISTS (
           SELECT 1 FROM research_groups g WHERE g.id=o.group_id AND g.is_active AND g.archived_at IS NULL)))
     WHEN o.group_id IS NOT NULL THEN EXISTS (
       SELECT 1 FROM research_groups g WHERE g.id=o.group_id AND g.is_active AND g.archived_at IS NULL
         AND (g.lead_id=actor OR EXISTS (SELECT 1 FROM group_members m
           WHERE m.group_id=g.id AND m.user_id=actor AND m.role='GROUP_LEADER' AND m.archived_at IS NULL)))
     ELSE o.creator_id=actor
   END);
$$;

COMMIT;
