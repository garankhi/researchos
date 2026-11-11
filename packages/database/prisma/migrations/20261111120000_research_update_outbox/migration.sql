-- RES-113: keep event references valid between business commit and publication.
BEGIN;

CREATE TABLE pending_research_updates (
  event_key varchar(255) PRIMARY KEY,
  job_id uuid NOT NULL UNIQUE,
  event_type research_update_type NOT NULL,
  actor_id uuid NOT NULL,
  output_id uuid,
  revision_id uuid,
  group_id uuid,
  opportunity_id uuid,
  seminar_id uuid,
  occurred_at timestamptz NOT NULL
);
ALTER TABLE pending_research_updates ADD FOREIGN KEY (job_id) REFERENCES background_jobs (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_research_updates ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_research_updates ADD FOREIGN KEY (output_id) REFERENCES research_outputs (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_research_updates ADD FOREIGN KEY (output_id, revision_id) REFERENCES output_revisions (output_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_research_updates ADD FOREIGN KEY (group_id) REFERENCES research_groups (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_research_updates ADD FOREIGN KEY (opportunity_id) REFERENCES research_opportunities (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE pending_research_updates ADD FOREIGN KEY (seminar_id) REFERENCES research_seminars (id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE pending_research_updates
  ALTER CONSTRAINT pending_research_updates_job_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE pending_research_updates ADD CONSTRAINT ck_pending_research_update_target CHECK (
  (event_type IN ('OUTPUT_SHARED', 'OUTPUT_REVISION_RELEASED') AND output_id IS NOT NULL AND revision_id IS NOT NULL AND group_id IS NULL AND opportunity_id IS NULL AND seminar_id IS NULL) OR
  (event_type = 'OUTPUT_LINKED_TO_GROUP' AND output_id IS NOT NULL AND revision_id IS NOT NULL AND group_id IS NOT NULL AND opportunity_id IS NULL AND seminar_id IS NULL) OR
  (event_type = 'OPPORTUNITY_OPENED' AND opportunity_id IS NOT NULL AND output_id IS NULL AND revision_id IS NULL AND group_id IS NULL AND seminar_id IS NULL) OR
  (event_type = 'SEMINAR_PUBLISHED' AND seminar_id IS NOT NULL AND output_id IS NULL AND revision_id IS NULL AND group_id IS NULL AND opportunity_id IS NULL)
);

CREATE FUNCTION enqueue_research_update(
  p_key text, p_type research_update_type, p_actor uuid,
  p_output uuid DEFAULT NULL, p_revision uuid DEFAULT NULL,
  p_group uuid DEFAULT NULL, p_opportunity uuid DEFAULT NULL,
  p_seminar uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  new_job_id uuid := gen_random_uuid();
  queue_prefix text := COALESCE(
    NULLIF(current_setting('researchos.research_updates_queue_prefix', true), ''),
    'researchos'
  );
BEGIN
  IF EXISTS (SELECT 1 FROM research_updates WHERE event_key = p_key) THEN
    RETURN;
  END IF;

  INSERT INTO pending_research_updates (
    event_key, job_id, event_type, actor_id, output_id, revision_id,
    group_id, opportunity_id, seminar_id, occurred_at
  ) VALUES (
    p_key, new_job_id, p_type, p_actor, p_output, p_revision,
    p_group, p_opportunity, p_seminar, CURRENT_TIMESTAMP
  ) ON CONFLICT (event_key) DO NOTHING;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- The worker can publish and remove a previous pending row while this insert waits.
  IF EXISTS (SELECT 1 FROM research_updates WHERE event_key = p_key) THEN
    DELETE FROM pending_research_updates WHERE job_id = new_job_id;
    RETURN;
  END IF;

  -- Keep the scope encoding aligned with researchUpdateScope in the worker.
  INSERT INTO background_jobs (id, owner_id, kind, idempotency_key, payload, queue_prefix)
  VALUES (
    new_job_id, p_actor, 'research-update', p_key, jsonb_build_object('eventKey', p_key),
    '@research-updates:' || encode(sha256(convert_to(queue_prefix, 'UTF8')), 'hex')
  );
  INSERT INTO outbox (job_id, generation) VALUES (new_job_id, 0);
END $$;

CREATE OR REPLACE FUNCTION emit_research_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind research_update_type; actor uuid;
BEGIN
 IF TG_TABLE_NAME='research_outputs' THEN
   IF NEW.sharing_status='SHARED' AND (TG_OP='INSERT' OR OLD.first_shared_at IS NULL OR NEW.current_release_id IS DISTINCT FROM OLD.current_release_id) THEN
     kind=CASE WHEN TG_OP='INSERT' OR OLD.first_shared_at IS NULL THEN 'OUTPUT_SHARED'::research_update_type ELSE 'OUTPUT_REVISION_RELEASED'::research_update_type END;
     SELECT released_by INTO actor FROM output_revisions WHERE id=NEW.current_release_id;
     PERFORM enqueue_research_update('output:'||NEW.id||':'||NEW.current_release_id, kind, actor, NEW.id, NEW.current_release_id);
   END IF;
 ELSIF TG_TABLE_NAME='group_output_links' THEN
   IF NEW.accepted_revision_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.accepted_revision_id IS DISTINCT FROM OLD.accepted_revision_id) THEN
     PERFORM enqueue_research_update('group:'||NEW.group_id||':'||NEW.output_id||':'||NEW.accepted_revision_id,
       'OUTPUT_LINKED_TO_GROUP', NEW.accepted_by, NEW.output_id, NEW.accepted_revision_id, NEW.group_id);
   END IF;
 ELSIF TG_TABLE_NAME='research_opportunities' THEN
   IF NEW.status='OPEN' AND (TG_OP='INSERT' OR OLD.published_at IS NULL) THEN
     PERFORM enqueue_research_update('opportunity:'||NEW.id, 'OPPORTUNITY_OPENED', NEW.creator_id, p_opportunity => NEW.id);
   END IF;
 ELSIF TG_TABLE_NAME='research_seminars' THEN
   IF NEW.published_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.published_at IS NULL) THEN
     PERFORM enqueue_research_update('seminar:'||NEW.id, 'SEMINAR_PUBLISHED', NEW.organizer_id, p_seminar => NEW.id);
   END IF;
 END IF;
 RETURN NEW;
END $$;

COMMENT ON TABLE research_updates IS 'Small durable feed of meaningful sharing actions. The worker records committed personal releases, accepted group revisions, opportunity opens and seminar publications through the transactional outbox. Project events are future-module writes. Typed target shape constrained in SQL.';

COMMIT;
