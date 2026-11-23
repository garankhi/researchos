CREATE TABLE topic_embedding_indexes (
  version text PRIMARY KEY,
  ready boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0
);

CREATE TABLE topic_embeddings (
  index_version text NOT NULL REFERENCES topic_embedding_indexes(version) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE,
  topic_id uuid NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE,
  pending_token uuid DEFAULT gen_random_uuid(),
  vector bytea,
  failed_attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (index_version, topic_id)
);

CREATE INDEX idx_topic_embeddings_topic ON topic_embeddings (topic_id);

CREATE TABLE topic_suggestion_requests (
  job_id uuid PRIMARY KEY REFERENCES background_jobs(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE,
  title varchar(500),
  abstract text,
  status varchar(16) NOT NULL DEFAULT 'pending',
  topic_ids uuid[] NOT NULL DEFAULT '{}',
  deadline_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_topic_suggestions_expiry ON topic_suggestion_requests (expires_at);

CREATE INDEX idx_topic_embeddings_pending
  ON topic_embeddings (index_version, next_attempt_at, topic_id) WHERE pending_token IS NOT NULL;
CREATE INDEX idx_topic_suggestions_pending_deadline
  ON topic_suggestion_requests (deadline_at) WHERE status = 'pending';

CREATE FUNCTION queue_topic_embedding_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.name, NEW.description, NEW.is_active)
       IS NOT DISTINCT FROM (OLD.name, OLD.description, OLD.is_active) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.is_active THEN
    INSERT INTO topic_embeddings (index_version, topic_id)
    SELECT version, NEW.id FROM topic_embedding_indexes
    ON CONFLICT (index_version, topic_id) DO UPDATE
      SET pending_token = gen_random_uuid(), vector = NULL, failed_attempts = 0,
          next_attempt_at = CURRENT_TIMESTAMP;
  ELSE
    DELETE FROM topic_embeddings WHERE topic_id = NEW.id;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER queue_topic_embedding_refresh
AFTER INSERT OR UPDATE OF name, description, is_active ON research_topics
FOR EACH ROW EXECUTE FUNCTION queue_topic_embedding_refresh();
