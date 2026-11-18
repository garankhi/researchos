BEGIN;

ALTER TABLE output_revisions
  ALTER COLUMN output_type SET DEFAULT 'ARTICLE',
  ADD COLUMN publication_date varchar(10),
  ADD COLUMN volume varchar(50),
  ADD COLUMN issue varchar(50),
  ADD COLUMN pages varchar(100),
  ADD COLUMN peer_reviewed boolean,
  ADD CONSTRAINT ck_output_publication_date CHECK (
    publication_date IS NULL OR (
      publication_year IS NOT NULL
      AND left(publication_date, 4) = publication_year::text
      AND publication_date ~ '^[1-9][0-9]{3}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$'
    )
  );

-- The ALTER TABLE lock keeps the migration's temporary trigger settings
-- inside this transaction. Preserve the original revision timestamps.
ALTER TABLE output_revisions DISABLE TRIGGER a_guard_revision;
ALTER TABLE output_revisions DISABLE TRIGGER touch_updated_at;
UPDATE output_revisions
SET output_type = 'ARTICLE'
WHERE upper(btrim(output_type)) IN ('PAPER', 'ARTICLE') AND output_type <> 'ARTICLE';
ALTER TABLE output_revisions ENABLE TRIGGER touch_updated_at;
ALTER TABLE output_revisions ENABLE TRIGGER a_guard_revision;

ALTER TABLE research_outputs
  ADD COLUMN create_idempotency_key varchar(200),
  ADD COLUMN create_request_hash char(64),
  ADD CONSTRAINT ck_output_create_request CHECK (
    (create_idempotency_key IS NULL AND create_request_hash IS NULL)
    OR (created_by IS NOT NULL AND create_idempotency_key IS NOT NULL AND create_request_hash IS NOT NULL)
  );

CREATE UNIQUE INDEX uq_output_creator_create_key
  ON research_outputs (created_by, create_idempotency_key);

COMMENT ON COLUMN research_outputs.doi IS
  'SQL normalizes whitespace/case and strips doi.org/doi: prefixes. Article creation reports a conflicting DOI. OpenAlex ingest can reuse the existing work for an authorship claim.';

COMMIT;
