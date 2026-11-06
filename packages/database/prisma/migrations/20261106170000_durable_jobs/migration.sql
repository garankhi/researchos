-- Additive migration; source definitions are in ResearchOS.dbml and
-- postgres-features.sql. No existing domain data is rewritten.
CREATE TABLE background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  kind varchar(64) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  generation int NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  result jsonb,
  error_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_background_job_status CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  CONSTRAINT ck_background_job_attempts CHECK (generation >= 0 AND attempts BETWEEN 0 AND 3),
  CONSTRAINT ck_background_job_key CHECK (length(btrim(idempotency_key)) > 0)
);
CREATE UNIQUE INDEX uq_background_job_request ON background_jobs(owner_id, kind, idempotency_key);
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  generation int NOT NULL,
  destination varchar(16) NOT NULL DEFAULT 'WORK',
  available_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  CONSTRAINT ck_outbox_destination CHECK (destination IN ('WORK','DLQ') AND generation >= 0)
);
CREATE UNIQUE INDEX uq_outbox_delivery ON outbox(job_id, generation, destination);
CREATE INDEX idx_outbox_ready ON outbox(available_at) WHERE dispatched_at IS NULL;
