-- RES-156: schedule opportunity expiry and guard fill at the cutoff.
ALTER TABLE background_jobs ALTER COLUMN owner_id DROP NOT NULL;
CREATE UNIQUE INDEX uq_system_background_job_request
  ON background_jobs (queue_prefix, kind, idempotency_key) WHERE owner_id IS NULL;

-- Protect manual and automatic fill at the exact database cutoff.
CREATE OR REPLACE FUNCTION guard_opportunity_fill_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'OPEN' AND NEW.status = 'FILLED'
     AND (OLD.application_deadline IS NULL OR OLD.application_deadline <= clock_timestamp()) THEN
    RAISE EXCEPTION 'Filling requires a future cutoff' USING ERRCODE = 'P0156';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_opportunity_fill_deadline BEFORE UPDATE OF status ON research_opportunities
  FOR EACH ROW EXECUTE FUNCTION guard_opportunity_fill_deadline();

-- RES-167: accept applications and serialize writes with group authorization changes.
ALTER TYPE opportunity_application_status ADD VALUE 'ACCEPTED';
ALTER TABLE research_opportunities ADD COLUMN auto_fill_on_acceptance boolean NOT NULL DEFAULT false;

ALTER TABLE opportunity_applications DROP CONSTRAINT ck_application_response;
ALTER TABLE opportunity_applications ADD CONSTRAINT ck_application_response CHECK (
  (status IN ('PENDING', 'WITHDRAWN') AND responded_by IS NULL AND responded_at IS NULL)
  OR (status::text IN ('INVITED_TO_DISCUSS', 'DECLINED', 'ACCEPTED')
      AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND responded_at >= applied_at)
);

CREATE FUNCTION guard_opportunity_fill_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND NEW.auto_fill_on_acceptance IS DISTINCT FROM OLD.auto_fill_on_acceptance THEN
    RAISE EXCEPTION 'Fill policy can only change in draft' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_opportunity_fill_policy BEFORE UPDATE OF auto_fill_on_acceptance ON research_opportunities
  FOR EACH ROW EXECUTE FUNCTION guard_opportunity_fill_policy();

CREATE OR REPLACE FUNCTION guard_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o research_opportunities;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Keep application history; withdraw pending instead' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
   SELECT * INTO o FROM research_opportunities WHERE id=NEW.opportunity_id FOR SHARE;
   IF NOT FOUND OR o.status<>'OPEN' OR o.archived_at IS NOT NULL OR o.application_deadline<=clock_timestamp() OR NOT is_researcher(NEW.applicant_id) OR NEW.status<>'PENDING' THEN
     RAISE EXCEPTION 'Application requires an eligible researcher and open unexpired opportunity' USING ERRCODE='23514'; END IF;
   IF o.auto_fill_on_acceptance AND EXISTS (
     SELECT 1 FROM opportunity_applications a
     WHERE a.opportunity_id=o.id AND a.status::text='ACCEPTED'
   ) THEN
     RAISE EXCEPTION 'This opportunity already has an accepted applicant' USING ERRCODE='23514';
   END IF;
   NEW.applied_at=clock_timestamp();
   NEW.response_due_at=((NEW.applied_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + make_interval(days=>o.response_sla_days)) AT TIME ZONE 'Asia/Ho_Chi_Minh';
 ELSE
   IF OLD.status<>'PENDING' OR NEW.status::text NOT IN ('WITHDRAWN','INVITED_TO_DISCUSS','DECLINED','ACCEPTED') THEN
     RAISE EXCEPTION 'Only pending application can transition once' USING ERRCODE='23514'; END IF;
   IF (NEW.id,NEW.opportunity_id,NEW.applicant_id,NEW.applicant_note,NEW.applied_at,NEW.response_due_at) IS DISTINCT FROM
      (OLD.id,OLD.opportunity_id,OLD.applicant_id,OLD.applicant_note,OLD.applied_at,OLD.response_due_at) THEN
     RAISE EXCEPTION 'Application identity and SLA snapshot are immutable' USING ERRCODE='23514'; END IF;
   IF NEW.status='WITHDRAWN' THEN NEW.withdrawn_at=clock_timestamp();
   ELSE
     IF NOT can_manage_opportunity(NEW.responded_by,NEW.opportunity_id) THEN RAISE EXCEPTION 'Response requires opportunity management authority' USING ERRCODE='23514'; END IF;
     NEW.responded_at=clock_timestamp();
   END IF;
 END IF;
 RETURN NEW;
END $$;

-- AFTER UPDATE means membership and fill only run for rows that were updated.
CREATE FUNCTION accept_opportunity_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o research_opportunities%ROWTYPE;
  filled_id uuid;
BEGIN
  SELECT * INTO STRICT o FROM research_opportunities WHERE id = NEW.opportunity_id FOR UPDATE;

  IF o.group_id IS NOT NULL THEN
    -- Group membership writes lock the group first. Hold the same lock
    -- through acceptance and recheck permissions after any wait.
    PERFORM id FROM research_groups WHERE id = o.group_id FOR UPDATE;
    PERFORM user_id FROM group_members
    WHERE group_id = o.group_id AND user_id = NEW.responded_by FOR SHARE;
    IF NOT can_manage_opportunity(NEW.responded_by, o.id) THEN
      RAISE EXCEPTION 'Opportunity management authority changed' USING ERRCODE = 'P0168';
    END IF;
  END IF;

  IF o.auto_fill_on_acceptance AND EXISTS (
    SELECT 1 FROM opportunity_applications a
    WHERE a.opportunity_id = o.id AND a.id <> NEW.id AND a.status = 'ACCEPTED'
  ) THEN
    RAISE EXCEPTION 'This opportunity already has an accepted applicant' USING ERRCODE = 'P0167';
  END IF;

  IF o.group_id IS NOT NULL THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (o.group_id, NEW.applicant_id, 'MEMBER')
    ON CONFLICT (group_id, user_id) DO UPDATE
      SET archived_at = NULL, role = 'MEMBER'
      WHERE group_members.archived_at IS NOT NULL;
  END IF;

  IF o.auto_fill_on_acceptance AND o.status = 'OPEN' AND o.archived_at IS NULL THEN
    BEGIN
      UPDATE research_opportunities SET status = 'FILLED'
      WHERE id = o.id AND application_deadline > clock_timestamp()
      RETURNING id INTO filled_id;
    EXCEPTION WHEN SQLSTATE 'P0156' THEN
      -- The cutoff passed during this update. The sweep owns expiry.
      filled_id := NULL;
    END;
    IF filled_id IS NOT NULL THEN
      INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, payload)
      VALUES (gen_random_uuid()::text, NEW.responded_by::text, 'OPPORTUNITY_STATUS_CHANGED',
        'research_opportunities', o.id::text,
        jsonb_build_object('fromStatus', 'OPEN', 'toStatus', 'FILLED',
          'reason', 'APPLICATION_ACCEPTED', 'applicationId', NEW.id));
    END IF;
  END IF;
  -- Also write the parent after a post-cutoff acceptance. Repeatable-read
  -- transactions must retry if their snapshot predates the accepted decision.
  IF o.auto_fill_on_acceptance AND filled_id IS NULL THEN
    UPDATE research_opportunities SET updated_at = clock_timestamp() WHERE id = o.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER accept_opportunity_application AFTER UPDATE OF status ON opportunity_applications
  FOR EACH ROW WHEN (OLD.status = 'PENDING' AND NEW.status::text = 'ACCEPTED')
  EXECUTE FUNCTION accept_opportunity_application();
