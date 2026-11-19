BEGIN;

CREATE TYPE article_pdf_metadata_status AS ENUM (
  'NOT_STARTED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED'
);

CREATE TABLE article_creation_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
  storage_key text NOT NULL UNIQUE,
  file_name varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  consumed_file_id uuid UNIQUE REFERENCES output_files(id) ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE,
  storage_deleted_at timestamptz,
  metadata_status article_pdf_metadata_status NOT NULL DEFAULT 'NOT_STARTED',
  CONSTRAINT ck_article_creation_upload_metadata CHECK (
    length(btrim(file_name)) > 0 AND mime_type = 'application/pdf'
    AND size_bytes > 0 AND sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT ck_article_creation_upload_expiry CHECK (expires_at > created_at),
  CONSTRAINT ck_article_creation_upload_consumption CHECK (
    (consumed_at IS NULL AND consumed_file_id IS NULL) OR
    (consumed_at IS NOT NULL AND consumed_file_id IS NOT NULL
      AND verified_at IS NOT NULL AND storage_deleted_at IS NULL)
  )
);

COMMENT ON TABLE article_creation_uploads IS 'Owner-scoped temporary Article PDF. Consumption links the verified object to its durable file record. Cleanup deletes only expired unconsumed objects.';

CREATE INDEX idx_article_creation_uploads_cleanup ON article_creation_uploads(expires_at, id)
 WHERE consumed_at IS NULL AND storage_deleted_at IS NULL;

COMMIT;
