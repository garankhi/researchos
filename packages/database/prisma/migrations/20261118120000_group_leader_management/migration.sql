BEGIN;

-- All current group leaders share management authority. An administrator
-- outside the group and archived memberships do not grant that authority.
CREATE OR REPLACE FUNCTION can_manage_group(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (
   SELECT 1 FROM research_groups g WHERE g.id=target AND g.is_active AND g.archived_at IS NULL
     AND (g.lead_id=actor OR EXISTS (
       SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=actor
         AND m.role='GROUP_LEADER' AND m.archived_at IS NULL)));
$$;

-- Group-scoped postings follow group leadership, including postings linked
-- to an active project in that group. Independent projects keep their lead.
CREATE OR REPLACE FUNCTION can_manage_opportunity(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (
   SELECT 1 FROM research_opportunities o WHERE o.id=target AND CASE
     WHEN o.group_id IS NOT NULL THEN can_manage_group(actor,o.group_id) AND (
       o.project_id IS NULL OR EXISTS (
         SELECT 1 FROM research_projects p WHERE p.id=o.project_id
           AND p.group_id=o.group_id AND p.archived_at IS NULL))
     WHEN o.project_id IS NOT NULL THEN EXISTS (
       SELECT 1 FROM research_projects p WHERE p.id=o.project_id
         AND p.group_id IS NULL AND p.lead_id=actor AND p.archived_at IS NULL)
     ELSE o.creator_id=actor
   END);
$$;

COMMIT;
