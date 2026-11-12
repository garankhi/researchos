-- Group member roles: MEMBER and GROUP_LEADER.
--
-- The old type had three values that did not describe authority:
-- CORE_MEMBER, COLLABORATOR and STUDENT_MEMBER. Only one of them carried
-- a permission - CORE_MEMBER, which the API treated as "may manage the
-- group's membership". COLLABORATOR and STUDENT_MEMBER were labels that
-- granted nothing and were never read by a policy.
--
-- The type now says what the role actually does. MEMBER is a group member
-- with no management rights, and GROUP_LEADER is the member who may
-- manage the membership. The group's own leader is still
-- `research_groups.lead_id`; a GROUP_LEADER membership row is the
-- delegated equivalent, and both are accepted by the same policy.
--
-- Postgres cannot rename or drop a value that is still in use, so the
-- type is rebuilt: the rows are mapped onto the new values, the column
-- is cast through text, and the old type is dropped.
BEGIN;

-- The rows are mapped by the ALTER below: a CORE_MEMBER becomes a
-- GROUP_LEADER, and every other row becomes a plain MEMBER.
CREATE TYPE group_member_role_new AS ENUM ('MEMBER', 'GROUP_LEADER');

ALTER TABLE group_members ALTER COLUMN role DROP DEFAULT;

ALTER TABLE group_members
  ALTER COLUMN role TYPE group_member_role_new
  USING CASE role::text
          WHEN 'CORE_MEMBER' THEN 'GROUP_LEADER'
          ELSE 'MEMBER'
        END::group_member_role_new;

ALTER TABLE group_members ALTER COLUMN role SET DEFAULT 'MEMBER';

DROP TYPE group_member_role;

ALTER TYPE group_member_role_new RENAME TO group_member_role;

-- The management policy reads the role, so it has to name the new value.
-- CORE_MEMBER is replaced by GROUP_LEADER; nothing else about the rule
-- changes.
CREATE OR REPLACE FUNCTION can_manage_opportunity(actor uuid, target uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_opportunities o WHERE o.id=target
 AND (o.creator_id=actor OR EXISTS (
   SELECT 1 FROM research_groups g WHERE g.id=o.group_id AND g.is_active AND g.archived_at IS NULL
   AND (g.lead_id=actor OR EXISTS (SELECT 1 FROM group_members m
     WHERE m.group_id=g.id AND m.user_id=actor AND m.role='GROUP_LEADER')))));
$$;

COMMIT;
