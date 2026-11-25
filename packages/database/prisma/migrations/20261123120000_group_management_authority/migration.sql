BEGIN;

-- The designated lead holds authority through the group assignment, even
-- when a separate membership row is archived. Delegation requires an active
-- membership. Keep lifecycle checks separate so managers can restore groups.
CREATE FUNCTION has_group_management_authority(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (
   SELECT 1 FROM research_groups g WHERE g.id=target
     AND (g.lead_id=actor OR EXISTS (
       SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=actor
         AND m.role='GROUP_LEADER' AND m.archived_at IS NULL)));
$$;

CREATE OR REPLACE FUNCTION can_manage_group(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT has_group_management_authority(actor, target) AND EXISTS (
   SELECT 1 FROM research_groups g WHERE g.id=target AND g.is_active AND g.archived_at IS NULL);
$$;

COMMIT;
