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

-- The ALTER TABLE lock keeps temporary trigger settings inside this
-- transaction. These changes leave the searchable text and access unchanged.
ALTER TABLE output_revisions DISABLE TRIGGER a_guard_revision;
ALTER TABLE output_revisions DISABLE TRIGGER touch_updated_at;
ALTER TABLE output_revisions DISABLE TRIGGER sync_search_index;

UPDATE output_revisions
SET output_type = 'ARTICLE'
WHERE upper(btrim(output_type)) IN ('PAPER', 'ARTICLE') AND output_type <> 'ARTICLE';

-- Recover metadata from the author row at the same position and with the same
-- name. Existing snapshot values take precedence, including explicit nulls.
WITH backfilled_bylines AS (
  SELECT revision.id, jsonb_agg(
    CASE WHEN author_row.id IS NULL THEN entry
         ELSE jsonb_build_object(
           'userId', author_row.user_id,
           'isCorresponding', author_row.is_corresponding_author
         ) || entry
    END ORDER BY position
  ) AS authors_snapshot
  FROM output_revisions AS revision
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(revision.authors_snapshot) = 'array'
         THEN revision.authors_snapshot ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS snapshot(entry, position)
  LEFT JOIN output_authors AS author_row
    ON author_row.output_id = revision.output_id
    AND to_jsonb(author_row.author_order) = entry->'order'
    AND to_jsonb(author_row.author_name_string) = entry->'name'
  WHERE revision.output_type = 'ARTICLE' AND revision.released_at IS NOT NULL
  GROUP BY revision.id
)
UPDATE output_revisions AS revision
SET authors_snapshot = backfilled_bylines.authors_snapshot
FROM backfilled_bylines
WHERE revision.id = backfilled_bylines.id
  AND revision.authors_snapshot IS DISTINCT FROM backfilled_bylines.authors_snapshot;

ALTER TABLE output_revisions ENABLE TRIGGER sync_search_index;
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

-- Decode the path bytes only for a resolver URL. Bare DOI names can contain a
-- literal percent sign. Keep this in sync with normalizeDoi in the API.
CREATE FUNCTION doi_name_from_resolver_path(resolver_path text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  segment text;
  decoded bytea := ''::bytea;
BEGIN
  IF resolver_path ~ '%(?![0-9a-fA-F]{2})' THEN
    RETURN NULL;
  END IF;

  FOR segment IN
    SELECT parts[1] FROM regexp_matches(resolver_path, '(%[0-9a-fA-F]{2}|[^%]+)', 'g') AS match(parts)
  LOOP
    IF left(segment, 1) = '%' THEN
      decoded := decoded || decode(substr(segment, 2), 'hex');
    ELSE
      decoded := decoded || convert_to(segment, 'UTF8');
    END IF;
  END LOOP;

  RETURN convert_from(decoded, 'UTF8');
EXCEPTION
  WHEN character_not_in_repertoire THEN RETURN NULL;
END $$;

CREATE FUNCTION canonical_output_doi(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  name text := regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  resolver_path text := substring(name COLLATE "C" FROM '(?i)^https?://(?:dx\.)?doi\.org/([^?#]*)');
BEGIN
  IF resolver_path IS NOT NULL THEN
    name := doi_name_from_resolver_path(resolver_path);
    IF name IS NULL THEN
      RAISE EXCEPTION 'Invalid DOI URL path' USING ERRCODE = '22023';
    END IF;
  ELSE
    name := regexp_replace(name COLLATE "C", '^doi:[[:space:]]*', '', 'i');
  END IF;

  IF name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid DOI control character' USING ERRCODE = '22023';
  END IF;

  RETURN nullif(lower(regexp_replace(name, '^[[:space:]]+|[[:space:]]+$', '', 'g') COLLATE "C"), '');
END $$;

CREATE OR REPLACE FUNCTION normalize_output_doi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.doi := canonical_output_doi(NEW.doi);
  RETURN NEW;
END $$;

-- CANDIDATE and ACCEPTED rows came from the old OpenAlex writer, which
-- stripped the resolver prefix before storing DOI.
-- A collision aborts through the existing unique constraint. Work identities
-- and ownership require an explicit resolution if both forms already exist.
ALTER TABLE research_outputs DISABLE TRIGGER touch_updated_at;
ALTER TABLE research_outputs DISABLE TRIGGER sync_search_index;

WITH imported_dois AS MATERIALIZED (
  SELECT
    id,
    doi_name_from_resolver_path(substring(doi FROM '^[^?#]*')) AS name
  FROM research_outputs
  WHERE import_state IN ('CANDIDATE', 'ACCEPTED')
    AND doi ~ '^10\.[0-9]'
    AND doi ~ '%[0-9a-fA-F]{2}'
)
UPDATE research_outputs AS output
SET doi = imported_dois.name
FROM imported_dois
WHERE output.id = imported_dois.id
  AND imported_dois.name ~ '^10\.[0-9]'
  AND imported_dois.name !~ '[[:cntrl:]]'
  AND output.doi IS DISTINCT FROM imported_dois.name;

ALTER TABLE research_outputs ENABLE TRIGGER sync_search_index;
ALTER TABLE research_outputs ENABLE TRIGGER touch_updated_at;

COMMENT ON COLUMN research_outputs.doi IS
  'SQL normalizes DOI names and decodes doi.org resolver paths. Article creation reports a conflicting DOI. OpenAlex ingest can reuse the existing work for an authorship claim.';

COMMIT;
