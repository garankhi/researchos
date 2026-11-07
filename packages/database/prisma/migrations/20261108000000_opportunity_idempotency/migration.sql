-- Apply after the ResearchOS.sql baseline. Safe to reapply.
-- Retry metadata stays on the existing opportunity; no new table is needed.
BEGIN;
ALTER TABLE research_opportunities
  ADD COLUMN IF NOT EXISTS create_idempotency_key varchar(200),
  ADD COLUMN IF NOT EXISTS create_request_hash char(64),
  ADD COLUMN IF NOT EXISTS create_response jsonb;

-- NULL keys allow ordinary creates without an Idempotency-Key header.
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunity_creator_create_key
  ON research_opportunities (creator_id, create_idempotency_key);

-- RES-121/RES-112: API editing, application visibility and response triggers
-- share one policy. Project leadership alone grants no additional edit access.
CREATE OR REPLACE FUNCTION can_manage_opportunity(actor uuid, target uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_opportunities o WHERE o.id=target
 AND (o.creator_id=actor OR EXISTS (
   SELECT 1 FROM research_groups g WHERE g.id=o.group_id AND g.is_active AND g.archived_at IS NULL
   AND (g.lead_id=actor OR EXISTS (SELECT 1 FROM group_members m
     WHERE m.group_id=g.id AND m.user_id=actor AND m.role='CORE_MEMBER')))));
$$;
COMMIT;
