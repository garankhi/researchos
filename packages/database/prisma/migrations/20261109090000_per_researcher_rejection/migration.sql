-- Per-researcher rejection for OpenAlex candidates.
--
-- The previous model put the review decision on the work:
-- `research_outputs.import_state` could be REJECTED or DISMISSED, which
-- reads as "this work was rejected" and "this work was set aside".
--
-- That is wrong for two reasons.
--
-- First, a work is shared between researchers. One researcher rejecting a
-- work says nothing about whether a co-author may still claim it, so the
-- decision cannot live on the work. The work only knows whether anybody
-- accepted it: NONE, CANDIDATE, ACCEPTED.
--
-- Second, DISMISSED and REJECTED were the same thing with two names - both
-- meant "do not show this to me again" - and both were represented by
-- mutating the work. One reversible state is enough: the claim row.
--
-- `publication_claims` already had exactly the right shape. It is one row
-- per (work, researcher) with a status, and REJECTED there means "this
-- researcher does not want this work". The rejection list reads those rows
-- back, so the decision stays reversible: the researcher can accept the work
-- later by moving the claim to CONFIRMED.
--
-- The work keeps import_state = 'CANDIDATE' when it is rejected, so it stays
-- in the candidate review flow and the other researchers are unaffected.
BEGIN;

-- A work that was globally REJECTED or DISMISSED is not globally rejected:
-- the rejection belongs to a researcher. The rows that carry the decision
-- are the claims, so the work goes back to being a candidate.
--
-- The claim rows of the researchers who rejected the work keep the decision,
-- so the rejection list stays populated for them.
UPDATE research_outputs o
   SET import_state = 'CANDIDATE'
 WHERE o.import_state IN ('REJECTED', 'DISMISSED');

-- The enum cannot drop a value that is still in use, so the type is
-- rebuilt: the new type holds the three states the column really has, the
-- column is cast through text, and the old type is dropped.
--
-- Three objects depend on the old type and have to be dropped first.
--
-- `owner_output_versions` selects the column, and Postgres refuses to
-- alter the type of a column that a view depends on.
--
-- The check constraint `ck_output_import_owner` compares the column to the
-- literal 'ACCEPTED', and that literal is cast to the enum type. The
-- constraint therefore holds a reference to the old type as well.
--
-- All three are recreated below with the same definition, plus one clause:
-- a candidate is not an owner working copy, because nobody owns it yet.
CREATE TYPE output_import_state_new AS ENUM ('NONE', 'CANDIDATE', 'ACCEPTED');

ALTER TABLE research_outputs DROP CONSTRAINT ck_output_import_owner;

DROP FUNCTION visible_owner_output_versions(uuid);
DROP VIEW owner_output_versions;

ALTER TABLE research_outputs
  ALTER COLUMN import_state DROP DEFAULT;

ALTER TABLE research_outputs
  ALTER COLUMN import_state TYPE output_import_state_new
  USING import_state::text::output_import_state_new;

ALTER TABLE research_outputs
  ALTER COLUMN import_state SET DEFAULT 'NONE';

DROP TYPE output_import_state;

ALTER TYPE output_import_state_new RENAME TO output_import_state;

-- The constraint is unchanged: an accepted work has an owner.
ALTER TABLE research_outputs ADD CONSTRAINT ck_output_import_owner
  CHECK (import_state <> 'ACCEPTED' OR owner_id IS NOT NULL);

CREATE VIEW owner_output_versions AS
 SELECT o.id AS output_id,o.owner_id,o.doi,o.visibility,o.access_group_id,o.first_shared_at,o.import_state,
 r.id AS revision_id,r.revision_no,r.title,r.abstract,r.venue,r.publisher,r.publication_year,r.publication_status,
 r.output_type,r.external_url,r.authors_snapshot,r.released_at
 FROM research_outputs o
 LEFT JOIN output_revisions r ON r.output_id = o.id
  AND (r.id = o.current_release_id OR (o.current_release_id IS NULL AND r.released_at IS NULL))
 WHERE o.sharing_status <> 'SHARED' AND o.import_state <> 'CANDIDATE';

CREATE FUNCTION visible_owner_output_versions(actor uuid) RETURNS SETOF owner_output_versions LANGUAGE sql STABLE AS $$
 SELECT r.* FROM owner_output_versions r WHERE r.owner_id = actor AND can_view_output(actor,r.output_id);
$$;

-- The three remaining values are the whole state space of the column:
-- NONE (not from an external pull), CANDIDATE (pulled, waiting for a
-- decision) and ACCEPTED (a researcher claimed it, owner_id is set).

-- The review queue needs its own access rule. `can_view_output` opens for
-- the owner or for a shared work, and a candidate is neither: it has no
-- owner and it is not shared. Without a separate rule the review screen
-- would have no readable source of candidates.
--
-- The rule is narrow on purpose. A candidate is visible to a researcher
-- when they have a claim row for it - that row is what suggested the work
-- to them - or when they pulled it themselves. Nothing else opens a
-- candidate, and a candidate never reaches Discovery or Search because
-- both read released_output_versions and the search index, and neither
-- holds a shared work without a released revision.
CREATE FUNCTION can_view_candidate(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_outputs o
 WHERE o.id=target AND o.import_state='CANDIDATE' AND (o.created_by=actor
 OR EXISTS (SELECT 1 FROM publication_claims c WHERE c.output_id=o.id AND c.user_id=actor)));
$$;

-- The review queue: every candidate the researcher may look at.
--
-- The function reads the candidates and joins the claim of this one actor
-- in. The claim is joined on the actor, so a candidate claimed by several
-- researchers is one row here, and a candidate the actor pulled themselves
-- has no claim of their own and arrives with an empty claim.
CREATE FUNCTION visible_candidate_reviews(actor uuid)
RETURNS TABLE(output_id uuid,doi varchar(255),created_by uuid,created_at timestamptz,
  claim_id uuid,user_id uuid,claim_status claim_status,match_source varchar(50),reviewed_at timestamptz)
LANGUAGE sql STABLE AS $$
 SELECT o.id,o.doi,o.created_by,o.created_at,
        c.id,c.user_id,c.status,c.match_source,c.reviewed_at
 FROM research_outputs o
 LEFT JOIN publication_claims c ON c.output_id=o.id AND c.user_id=actor
 WHERE o.import_state='CANDIDATE' AND can_view_candidate(actor,o.id);
$$;

-- The suggestion queue: the candidates that are still waiting for a
-- decision. A rejected claim removes the work from this list for that
-- researcher only - it does not remove it for anybody else.
CREATE FUNCTION visible_candidate_suggestions(actor uuid)
RETURNS TABLE(output_id uuid,doi varchar(255),created_by uuid,created_at timestamptz,
  claim_id uuid,user_id uuid,claim_status claim_status,match_source varchar(50),reviewed_at timestamptz)
LANGUAGE sql STABLE AS $$
 SELECT o.id,o.doi,o.created_by,o.created_at,
        c.id,c.user_id,c.status,c.match_source,c.reviewed_at
 FROM research_outputs o
 LEFT JOIN publication_claims c ON c.output_id=o.id AND c.user_id=actor
 WHERE o.import_state='CANDIDATE' AND can_view_candidate(actor,o.id)
 AND c.status IS DISTINCT FROM 'REJECTED';
$$;

-- The rejection list: the candidates this researcher rejected, kept so the
-- work can be accepted later. The claim row is never deleted, so the
-- decision stays reversible.
CREATE FUNCTION visible_rejected_candidates(actor uuid)
RETURNS TABLE(output_id uuid,doi varchar(255),created_by uuid,created_at timestamptz,
  claim_id uuid,user_id uuid,claim_status claim_status,match_source varchar(50),reviewed_at timestamptz)
LANGUAGE sql STABLE AS $$
 SELECT o.id,o.doi,o.created_by,o.created_at,
        c.id,c.user_id,c.status,c.match_source,c.reviewed_at
 FROM research_outputs o
 JOIN publication_claims c ON c.output_id=o.id AND c.user_id=actor
 WHERE o.import_state='CANDIDATE' AND c.status='REJECTED'
 AND can_view_candidate(actor,o.id);
$$;

-- The review queue and the rejection list are read per researcher and per
-- status, so the (user_id, status) index serves both without scanning
-- every claim of a work.
CREATE INDEX publication_claims_user_id_status_idx ON publication_claims(user_id, status);

COMMIT;
