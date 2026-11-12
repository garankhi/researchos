-- PostgreSQL supplement to ResearchOS.dbml. Build into ResearchOS.sql, not standalone.
-- Predicates take a TRUSTED backend actor. They are not RLS or SQL authentication.
-- Infrastructure lifetime references are immediate, matching the additive
-- durable-job migration rather than the diagram exporter's default deferral.
ALTER TABLE background_jobs ALTER CONSTRAINT background_jobs_owner_id_fkey NOT DEFERRABLE;
ALTER TABLE outbox ALTER CONSTRAINT outbox_job_id_fkey NOT DEFERRABLE;
CREATE INDEX idx_outbox_ready ON outbox(available_at) WHERE dispatched_at IS NULL;
CREATE UNIQUE INDEX uq_unrevoked_user_role ON user_role_assignments(user_id, role) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX uq_local_topic_name ON research_topics(subfield_id, lower(name)) WHERE source = 'LOCAL';
CREATE UNIQUE INDEX uq_output_editable_draft ON output_revisions(output_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX uq_application_not_withdrawn ON opportunity_applications(opportunity_id, applicant_id) WHERE status <> 'WITHDRAWN';
CREATE INDEX idx_topic_search ON research_topics USING gin(name gin_trgm_ops);
CREATE INDEX idx_revision_title_search ON output_revisions USING gin(title gin_trgm_ops) WHERE released_at IS NOT NULL;
CREATE INDEX idx_digest_ready ON digest_deliveries(next_attempt_at) WHERE status IN ('PENDING','FAILED');
CREATE INDEX idx_digest_lease ON digest_deliveries(locked_until) WHERE status = 'PROCESSING';
CREATE INDEX idx_application_due ON opportunity_applications(response_due_at) WHERE status = 'PENDING';
CREATE INDEX idx_group_display ON group_output_links(group_id, accepted_revision_id) WHERE accepted_revision_id IS NOT NULL;
CREATE INDEX idx_unrevoked_sessions_user ON user_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_handover_output_history ON resource_handovers(output_id, performed_at) WHERE output_id IS NOT NULL;
CREATE INDEX idx_handover_group_history ON resource_handovers(group_id, performed_at) WHERE group_id IS NOT NULL;
CREATE INDEX idx_revision_fts ON output_revisions USING gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(abstract,''))) WHERE released_at IS NOT NULL;
CREATE INDEX idx_output_visibility_lookup ON research_outputs(visibility, sharing_status) WHERE sharing_status = 'SHARED';
CREATE INDEX idx_search_index_doc ON search_index USING gin(doc);
CREATE INDEX idx_search_index_title_trgm ON search_index USING gin(title gin_trgm_ops);
CREATE INDEX idx_search_index_scope ON search_index(visibility, access_group_id);
CREATE INDEX idx_search_index_type ON search_index(entity_type);

CREATE VIEW effective_user_access AS
SELECT u.id AS user_id, u.user_type, u.is_active,
  (u.is_active AND (u.user_type = 'FACULTY' OR EXISTS (
    SELECT 1 FROM user_role_assignments a WHERE a.user_id=u.id AND a.role='RESEARCHER' AND a.revoked_at IS NULL AND a.granted_at<=CURRENT_TIMESTAMP
  ))) AS is_researcher,
  (u.is_active AND EXISTS (
    SELECT 1 FROM user_role_assignments a WHERE a.user_id=u.id AND a.role='ADMIN' AND a.revoked_at IS NULL AND a.granted_at<=CURRENT_TIMESTAMP
  )) AS is_admin
FROM users u;
CREATE FUNCTION is_researcher(actor uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM effective_user_access WHERE user_id=actor AND is_researcher);
$$;
CREATE FUNCTION is_admin(actor uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM effective_user_access WHERE user_id=actor AND is_admin);
$$;
-- Management transaction contract: call BEFORE removing ADMIN, deactivating or
-- deleting an account. All admin-affecting management transactions use this
-- mutex, including activation/grants; backend still authenticates the operator.
-- Use READ COMMITTED; at stronger isolation retry conflicts and re-evaluate.
CREATE FUNCTION assert_admin_removal_allowed(target_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(1920233327, 1);
 IF is_admin(target_user) AND NOT EXISTS (
   SELECT 1 FROM effective_user_access WHERE is_admin AND user_id<>target_user
 ) THEN
   RAISE EXCEPTION 'Cannot remove the last active admin; appoint another active admin first' USING ERRCODE='23514';
 END IF;
END $$;
CREATE VIEW active_user_sessions AS
 SELECT s.* FROM user_sessions s JOIN users u ON u.id=s.user_id
 WHERE u.is_active AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP AND s.idle_expires_at > CURRENT_TIMESTAMP;
CREATE FUNCTION is_group_member(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM research_groups g JOIN users u ON u.id=actor AND u.is_active
 WHERE g.id=target AND g.is_active AND g.archived_at IS NULL AND
 (g.lead_id=actor OR EXISTS (SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=actor)));
$$;
CREATE FUNCTION can_manage_group(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_groups WHERE id=target AND lead_id=actor AND is_active AND archived_at IS NULL);
$$;
CREATE FUNCTION can_manage_output(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_outputs WHERE id=target AND owner_id=actor);
$$;
CREATE FUNCTION can_view_output(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM research_outputs o JOIN users u ON u.id=actor AND u.is_active
 WHERE o.id=target AND (o.owner_id=actor OR (o.sharing_status='SHARED' AND
 (o.visibility='FPTU_COMMUNITY' OR (o.visibility='RESEARCH_GROUP' AND is_group_member(actor,o.access_group_id))))));
$$;
-- A candidate is a work pulled from OpenAlex that nobody owns yet. It has no
-- owner, so can_view_output cannot reach it: that predicate only opens for the
-- owner or for a shared work. The review flow needs its own rule, and the
-- rule is deliberately narrow.
--
-- A candidate is visible to a researcher when that researcher has a claim row
-- for it - the row is what suggested the work to them in the first place - or
-- when they pulled it themselves. Nothing else opens a candidate: it is not
-- shared, so it never reaches Discovery or Search.
--
-- A rejected candidate stays visible here on purpose. The rejection hides the
-- work from the suggestion list, not from the rejection list, so the
-- researcher can still find it and accept it later.
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
-- The suggestion queue: the candidates that are still waiting for a decision.
-- A rejected claim removes the work from this list for that researcher only.
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
-- work can be accepted later. The row is never deleted, so the decision stays
-- reversible.
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
CREATE FUNCTION can_manage_opportunity(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_opportunities o WHERE o.id=target
 AND (o.creator_id=actor OR EXISTS (
   SELECT 1 FROM research_groups g WHERE g.id=o.group_id AND g.is_active AND g.archived_at IS NULL
   AND (g.lead_id=actor OR EXISTS (SELECT 1 FROM group_members m
     WHERE m.group_id=g.id AND m.user_id=actor AND m.role='GROUP_LEADER')))));
$$;

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','local_credentials','researcher_profiles','research_fields','research_subfields','research_topics',
 'research_groups','research_outputs','output_revisions','research_opportunities','project_milestones','research_records','digest_preferences'] LOOP
 EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',t);
 END LOOP;
END $$;

-- Auth additions: caller authorization/password verification remain backend duties.
CREATE FUNCTION normalize_user_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.email=lower(btrim(NEW.email));
 IF NEW.email='' THEN RAISE EXCEPTION 'Login email must not be empty' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER normalize_user_email BEFORE INSERT OR UPDATE OF email ON users FOR EACH ROW EXECUTE FUNCTION normalize_user_email();

-- Auth/account mutations use READ COMMITTED. Backend locks users before
-- credentials and verifies authentication before inserting a session.
-- This final guard also serializes LOCAL/OIDC inserts with deactivation.
CREATE FUNCTION guard_session_active_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_active boolean;
BEGIN
 SELECT is_active INTO account_active FROM users WHERE id=NEW.user_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session user does not exist' USING ERRCODE='23503'; END IF;
 IF NOT account_active THEN RAISE EXCEPTION 'Cannot create a session for an inactive user' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_session_active_user BEFORE INSERT ON user_sessions
 FOR EACH ROW EXECUTE FUNCTION guard_session_active_user();

CREATE FUNCTION revoke_sessions_after_deactivation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE user_sessions SET revoked_at=clock_timestamp(),revocation_reason='ACCOUNT_DEACTIVATED'
 WHERE user_id=NEW.id AND revoked_at IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER revoke_deactivated_sessions AFTER UPDATE OF is_active ON users
 FOR EACH ROW WHEN (OLD.is_active AND NOT NEW.is_active)
 EXECUTE FUNCTION revoke_sessions_after_deactivation();

CREATE FUNCTION normalize_output_doi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.doi=lower(regexp_replace(NEW.doi,'^[[:space:]]+|[[:space:]]+$','','g'));
 NEW.doi=regexp_replace(NEW.doi,'^(https?://(dx\.)?doi\.org/|doi:[[:space:]]*)','','i');
 NEW.doi=nullif(regexp_replace(NEW.doi,'^[[:space:]]+|[[:space:]]+$','','g'),'');
 RETURN NEW;
END $$;
CREATE TRIGGER normalize_output_doi BEFORE INSERT OR UPDATE OF doi ON research_outputs
 FOR EACH ROW EXECUTE FUNCTION normalize_output_doi();

CREATE FUNCTION guard_group_leader_eligibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT is_researcher(NEW.lead_id) THEN
   RAISE EXCEPTION 'Group leader must be an active researcher' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_group_leader_eligibility BEFORE INSERT OR UPDATE OF lead_id ON research_groups
 FOR EACH ROW EXECUTE FUNCTION guard_group_leader_eligibility();

-- Log insertion and holder update commit/rollback together. Row locking and
-- expected previous_user_id reject stale/concurrent handover requests.
-- BEFORE only prepares the row; cross-table effects belong to AFTER so an
-- ON CONFLICT DO NOTHING insert cannot change a holder without a history row.
CREATE FUNCTION prepare_resource_handover() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.reason=btrim(NEW.reason);
 NEW.authorization_reference=btrim(NEW.authorization_reference);
 NEW.performed_at=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER prepare_resource_handover BEFORE INSERT ON resource_handovers
 FOR EACH ROW EXECUTE FUNCTION prepare_resource_handover();
CREATE FUNCTION apply_resource_handover() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_holder uuid; holder_active boolean;
BEGIN
 IF num_nonnulls(NEW.output_id,NEW.group_id)<>1 THEN
   RAISE EXCEPTION 'Handover must target exactly one output or group' USING ERRCODE='23514';
 END IF;
 IF NEW.output_id IS NOT NULL THEN
   -- Holder changes do not change resource keys. This lock serializes transfers
   -- without conflicting with FK KEY SHARE locks taken by history inserts.
   SELECT owner_id INTO current_holder FROM research_outputs WHERE id=NEW.output_id FOR NO KEY UPDATE;
 ELSE
   SELECT lead_id INTO current_holder FROM research_groups WHERE id=NEW.group_id FOR NO KEY UPDATE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Handover resource does not exist' USING ERRCODE='23503'; END IF;
 IF current_holder IS NULL OR current_holder IS DISTINCT FROM NEW.previous_user_id THEN
   RAISE EXCEPTION 'Previous holder is missing or changed; reload before handover' USING ERRCODE='23514';
 END IF;
 IF NOT is_admin(NEW.performed_by) OR NOT is_researcher(NEW.new_user_id) OR NEW.performed_by=NEW.new_user_id THEN
   RAISE EXCEPTION 'Handover requires an active admin and a different active researcher recipient' USING ERRCODE='23514';
 END IF;
 SELECT is_active INTO holder_active FROM users WHERE id=current_holder;
 IF NEW.basis='HOLDER_CONSENT' AND NOT holder_active THEN
   RAISE EXCEPTION 'Inactive holder requires institutional authorization' USING ERRCODE='23514';
 END IF;
 IF NEW.output_id IS NOT NULL THEN
   UPDATE research_outputs SET owner_id=NEW.new_user_id WHERE id=NEW.output_id;
 ELSE
   UPDATE research_groups SET lead_id=NEW.new_user_id WHERE id=NEW.group_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER apply_resource_handover AFTER INSERT ON resource_handovers
 FOR EACH ROW EXECUTE FUNCTION apply_resource_handover();
CREATE FUNCTION reject_handover_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Handover history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_handover BEFORE UPDATE OR DELETE ON resource_handovers
 FOR EACH ROW EXECUTE FUNCTION reject_handover_mutation();

CREATE FUNCTION stamp_password_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Credentials cannot move to another user' USING ERRCODE='23514'; END IF;
 IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN NEW.password_changed_at=clock_timestamp();
 ELSIF NEW.password_changed_at IS DISTINCT FROM OLD.password_changed_at THEN
   RAISE EXCEPTION 'Password change timestamp follows hash changes' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stamp_password_change BEFORE UPDATE ON local_credentials FOR EACH ROW EXECUTE FUNCTION stamp_password_change();
CREATE FUNCTION revoke_sessions_after_password_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE user_sessions SET revoked_at=clock_timestamp(),revocation_reason='PASSWORD_CHANGED'
 WHERE user_id=NEW.user_id AND revoked_at IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER revoke_password_sessions AFTER UPDATE OF password_hash ON local_credentials
 FOR EACH ROW WHEN (OLD.password_hash IS DISTINCT FROM NEW.password_hash)
 EXECUTE FUNCTION revoke_sessions_after_password_change();

CREATE FUNCTION normalize_taxonomy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_source taxonomy_source;
BEGIN
 NEW.name=btrim(regexp_replace(NEW.name,'[[:space:]]+',' ','g'));
 IF NEW.name='' THEN RAISE EXCEPTION 'Taxonomy name must not be empty' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.source IS DISTINCT FROM OLD.source OR NEW.external_id IS DISTINCT FROM OLD.external_id) THEN
   RAISE EXCEPTION 'Taxonomy source identity is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='research_subfields' THEN SELECT source INTO parent_source FROM research_fields WHERE id=NEW.field_id;
 ELSIF TG_TABLE_NAME='research_topics' THEN
   SELECT source INTO parent_source FROM research_subfields WHERE id=NEW.subfield_id;
   IF NEW.source='LOCAL' AND TG_OP='INSERT' THEN
     IF NOT is_researcher(NEW.created_by) THEN RAISE EXCEPTION 'LOCAL topic creator must be a researcher' USING ERRCODE='23514'; END IF;
     NEW.is_active=true;
   END IF;
 END IF;
 IF NEW.source<>'LOCAL' AND parent_source IS NOT NULL AND parent_source<>NEW.source THEN
   RAISE EXCEPTION 'Imported child must use a parent from the same source' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER normalize_taxonomy BEFORE INSERT OR UPDATE ON research_fields FOR EACH ROW EXECUTE FUNCTION normalize_taxonomy();
CREATE TRIGGER normalize_taxonomy BEFORE INSERT OR UPDATE ON research_subfields FOR EACH ROW EXECUTE FUNCTION normalize_taxonomy();
CREATE TRIGGER normalize_taxonomy BEFORE INSERT OR UPDATE ON research_topics FOR EACH ROW EXECUTE FUNCTION normalize_taxonomy();

CREATE FUNCTION guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
   IF OLD.released_at IS NOT NULL THEN RAISE EXCEPTION 'Released revision is immutable' USING ERRCODE='23514'; END IF;
   IF TG_OP='DELETE' THEN RETURN OLD; END IF;
   IF (NEW.id,NEW.output_id,NEW.revision_no) IS DISTINCT FROM (OLD.id,OLD.output_id,OLD.revision_no) THEN
     RAISE EXCEPTION 'Revision identity is immutable' USING ERRCODE='23514';
   END IF;
 END IF;
 IF NEW.released_at IS NOT NULL AND (NOT can_manage_output(NEW.released_by,NEW.output_id) OR length(btrim(NEW.title))=0) THEN
   RAISE EXCEPTION 'Only a managing researcher can release a valid revision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_revision BEFORE INSERT OR UPDATE OR DELETE ON output_revisions FOR EACH ROW EXECUTE FUNCTION guard_revision();

CREATE FUNCTION guard_revision_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; frozen timestamptz;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.revision_id,NEW.output_id) IS DISTINCT FROM (OLD.revision_id,OLD.output_id) THEN
   RAISE EXCEPTION 'Attachment cannot move between revisions; delete and insert in draft' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN rid=OLD.revision_id; ELSE rid=NEW.revision_id; END IF;
 SELECT released_at INTO frozen FROM output_revisions WHERE id=rid FOR UPDATE;
 IF frozen IS NOT NULL THEN RAISE EXCEPTION 'Released revision attachments are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_revision_attachment BEFORE INSERT OR UPDATE OR DELETE ON output_topics FOR EACH ROW EXECUTE FUNCTION guard_revision_attachment();
CREATE TRIGGER guard_revision_attachment BEFORE INSERT OR UPDATE OR DELETE ON output_revision_files FOR EACH ROW EXECUTE FUNCTION guard_revision_attachment();
CREATE FUNCTION guard_file_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['visibility','access_group_id','is_available']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['visibility','access_group_id','is_available']) THEN
   RAISE EXCEPTION 'Stored file payload is immutable; upload a new file row' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER guard_file_payload BEFORE UPDATE ON output_files FOR EACH ROW EXECUTE FUNCTION guard_file_payload();
CREATE FUNCTION guard_output_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.current_release_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM output_revisions
 WHERE id=NEW.current_release_id AND output_id=NEW.id AND released_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Current release must be a released revision of this output' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND OLD.first_shared_at IS NOT NULL AND
 (NEW.first_shared_at IS DISTINCT FROM OLD.first_shared_at OR NEW.sharing_status='DRAFT') THEN
   RAISE EXCEPTION 'Previously shared output cannot reset its history to draft; archive it' USING ERRCODE='23514';
 END IF;
 IF NEW.sharing_status='SHARED' AND (TG_OP='INSERT' OR NEW.current_release_id IS DISTINCT FROM OLD.current_release_id OR OLD.sharing_status<>'SHARED')
 AND NOT is_researcher(NEW.owner_id) THEN RAISE EXCEPTION 'Sharing requires an active researcher owner' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_guard_output_release BEFORE INSERT OR UPDATE ON research_outputs FOR EACH ROW EXECUTE FUNCTION guard_output_release();

CREATE VIEW released_output_versions AS
 SELECT o.id AS output_id,o.owner_id,o.doi,o.visibility,o.access_group_id,o.first_shared_at,
 r.id AS revision_id,r.revision_no,r.title,r.abstract,r.venue,r.publisher,r.publication_year,r.publication_status,
 r.output_type,r.external_url,r.authors_snapshot,r.released_at
 FROM research_outputs o JOIN output_revisions r ON (r.output_id,r.id)=(o.id,o.current_release_id)
 WHERE o.sharing_status='SHARED' AND r.released_at IS NOT NULL;
CREATE VIEW group_output_releases AS
 SELECT l.group_id,l.accepted_at,r.*
 FROM group_output_links l JOIN research_groups g ON g.id=l.group_id
 JOIN research_outputs o ON o.id=l.output_id
 JOIN output_revisions r ON r.id=l.accepted_revision_id AND r.output_id=l.output_id
 WHERE g.is_active AND g.archived_at IS NULL AND o.sharing_status='SHARED' AND r.released_at IS NOT NULL;
CREATE FUNCTION visible_output_releases(actor uuid) RETURNS SETOF released_output_versions LANGUAGE sql STABLE AS $$
 SELECT r.* FROM released_output_versions r WHERE can_view_output(actor,r.output_id);
$$;
-- The owner's own working copy: an accepted F0 work that is not published yet.
-- It stays out of released_output_versions so it never reaches Discovery or Search,
-- but the researcher can still see it in their own profile.
-- The working copy is the editable draft revision (uq_output_editable_draft allows
-- one per output); current_release_id is only set once the revision is released.
-- A candidate is not a working copy: nobody owns it yet, and it is read
-- through the candidate review functions instead.
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
CREATE FUNCTION visible_group_output_releases(actor uuid,target_group uuid) RETURNS SETOF group_output_releases LANGUAGE sql STABLE AS $$
 SELECT r.* FROM group_output_releases r WHERE r.group_id=target_group AND can_view_output(actor,r.output_id);
$$;
-- Search index permission filter. Mirrors can_view_output exactly: the owner
-- always sees the record, FPTU_COMMUNITY is visible to everyone, RESEARCH_GROUP
-- is visible to the members of access_group_id. The owner case matters - a
-- PRIVATE-visibility work stays findable by its owner in search.
-- The four entity types carry the same visibility triple, so one filter covers
-- all of them.
-- The active-user requirement of can_view_output applies to every branch here:
-- an unknown, NULL or inactive actor sees nothing at all, and an inactive
-- owner does not reach their own private records either.
CREATE FUNCTION visible_search_index(actor uuid) RETURNS SETOF search_index LANGUAGE sql STABLE AS $$
 SELECT s.* FROM search_index s
 JOIN users u ON u.id=actor AND u.is_active
 WHERE s.owner_id = actor
    OR s.visibility = 'FPTU_COMMUNITY'
    OR (s.visibility = 'RESEARCH_GROUP' AND is_group_member(actor, s.access_group_id));
$$;
CREATE FUNCTION can_view_output_file(actor uuid,target_file uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM output_files f JOIN research_outputs o ON o.id=f.output_id
 WHERE f.id=target_file AND f.is_available AND can_view_output(actor,o.id)
 AND (o.owner_id=actor OR (f.visibility='FPTU_COMMUNITY' OR (f.visibility='RESEARCH_GROUP' AND is_group_member(actor,f.access_group_id))))
 AND (o.owner_id=actor OR EXISTS (SELECT 1 FROM output_revision_files rf WHERE rf.file_id=f.id AND
 (rf.revision_id=o.current_release_id OR EXISTS (SELECT 1 FROM group_output_releases g WHERE g.output_id=o.id AND g.id=rf.revision_id)))));
$$;

CREATE FUNCTION guard_group_output() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE new_request boolean; new_decision boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Remove group association using REMOVED status' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.output_id,NEW.group_id) IS DISTINCT FROM (OLD.output_id,OLD.group_id) THEN
   RAISE EXCEPTION 'Group/output identity is immutable' USING ERRCODE='23514'; END IF;
 new_request=TG_OP='INSERT' OR (NEW.requested_revision_id,NEW.requested_by,NEW.requested_at) IS DISTINCT FROM (OLD.requested_revision_id,OLD.requested_by,OLD.requested_at);
 new_decision=TG_OP='INSERT' OR (NEW.status,NEW.decided_by,NEW.decided_at) IS DISTINCT FROM (OLD.status,OLD.decided_by,OLD.decided_at);
 IF NOT EXISTS (SELECT 1 FROM output_revisions WHERE id=NEW.requested_revision_id AND output_id=NEW.output_id AND released_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Group can only receive a released revision' USING ERRCODE='23514'; END IF;
 IF new_request THEN
   IF NOT is_researcher(NEW.requested_by) OR NOT is_group_member(NEW.requested_by,NEW.group_id) OR NOT can_view_output(NEW.requested_by,NEW.output_id)
   OR NOT EXISTS (SELECT 1 FROM research_outputs WHERE id=NEW.output_id AND sharing_status='SHARED') THEN
     RAISE EXCEPTION 'Request requires a researcher member and a visible shared output' USING ERRCODE='23514'; END IF;
   IF NEW.status NOT IN ('PENDING','ACCEPTED') THEN RAISE EXCEPTION 'New request must be pending or directly accepted' USING ERRCODE='23514'; END IF;
   IF NEW.status='ACCEPTED' AND (NOT can_manage_group(NEW.requested_by,NEW.group_id) OR NOT can_manage_output(NEW.requested_by,NEW.output_id)) THEN
     RAISE EXCEPTION 'Direct inclusion requires leader ownership' USING ERRCODE='23514'; END IF;
 END IF;
 IF new_decision AND NEW.status<>'PENDING' AND NOT can_manage_group(NEW.decided_by,NEW.group_id) THEN
   RAISE EXCEPTION 'Only the current researcher leader can decide group inclusion' USING ERRCODE='23514'; END IF;
 IF NEW.status='ACCEPTED' AND (NEW.accepted_by IS DISTINCT FROM NEW.decided_by OR NEW.accepted_at IS DISTINCT FROM NEW.decided_at) THEN
   RAISE EXCEPTION 'Accepted pin must match decision' USING ERRCODE='23514'; END IF;
 IF NEW.status='REMOVED' AND (NEW.removed_by IS DISTINCT FROM NEW.decided_by OR NEW.removed_at IS DISTINCT FROM NEW.decided_at) THEN
   RAISE EXCEPTION 'Removal must match decision' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.status='PENDING' AND NEW.accepted_revision_id IS NOT NULL THEN
   RAISE EXCEPTION 'New pending link has no accepted revision' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IN ('PENDING','REJECTED') AND
 (NEW.accepted_revision_id,NEW.accepted_by,NEW.accepted_at) IS DISTINCT FROM (OLD.accepted_revision_id,OLD.accepted_by,OLD.accepted_at) THEN
   RAISE EXCEPTION 'Pending/rejected request must preserve previous accepted pin' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_group_output BEFORE INSERT OR UPDATE OR DELETE ON group_output_links FOR EACH ROW EXECUTE FUNCTION guard_group_output();

CREATE FUNCTION normalize_opportunity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Create the opportunity as DRAFT, then publish it' USING ERRCODE='23514'; END IF;
 NEW.expected_role=nullif(btrim(regexp_replace(NEW.expected_role,'[[:space:]]+',' ','g')),'');
 IF NEW.group_id IS NOT NULL AND NEW.project_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM research_projects WHERE id=NEW.project_id AND group_id=NEW.group_id) THEN
   RAISE EXCEPTION 'Opportunity group must match project group' USING ERRCODE='23514'; END IF;
 IF NEW.status='OPEN' AND (TG_OP='INSERT' OR OLD.status<>'OPEN') THEN
   IF NEW.application_deadline IS NULL OR NEW.application_deadline<=clock_timestamp() OR NEW.archived_at IS NOT NULL THEN
     RAISE EXCEPTION 'Opening requires a future cutoff and unarchived opportunity' USING ERRCODE='23514'; END IF;
   NEW.published_at=coalesce(NEW.published_at,clock_timestamp());
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER normalize_opportunity BEFORE INSERT OR UPDATE ON research_opportunities FOR EACH ROW EXECUTE FUNCTION normalize_opportunity();
CREATE FUNCTION guard_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o research_opportunities;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Keep application history; withdraw pending instead' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
   SELECT * INTO o FROM research_opportunities WHERE id=NEW.opportunity_id FOR SHARE;
   IF NOT FOUND OR o.status<>'OPEN' OR o.archived_at IS NOT NULL OR o.application_deadline<=clock_timestamp() OR NOT is_researcher(NEW.applicant_id) OR NEW.status<>'PENDING' THEN
     RAISE EXCEPTION 'Application requires an eligible researcher and open unexpired opportunity' USING ERRCODE='23514'; END IF;
   NEW.applied_at=clock_timestamp();
   NEW.response_due_at=((NEW.applied_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + make_interval(days=>o.response_sla_days)) AT TIME ZONE 'Asia/Ho_Chi_Minh';
 ELSE
   IF OLD.status<>'PENDING' OR NEW.status NOT IN ('WITHDRAWN','INVITED_TO_DISCUSS','DECLINED') THEN
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
CREATE TRIGGER guard_application BEFORE INSERT OR UPDATE OR DELETE ON opportunity_applications FOR EACH ROW EXECUTE FUNCTION guard_application();
CREATE FUNCTION visible_opportunity_applications(actor uuid) RETURNS SETOF opportunity_applications LANGUAGE sql STABLE AS $$
 SELECT a.* FROM opportunity_applications a WHERE is_researcher(actor) AND
 (a.applicant_id=actor OR can_manage_opportunity(actor,a.opportunity_id));
$$;

CREATE FUNCTION guard_researcher_feature() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor uuid;
BEGIN
 IF TG_TABLE_NAME='user_follows' THEN actor=NEW.follower_id; ELSE actor=NEW.user_id; END IF;
 IF TG_TABLE_NAME='digest_preferences' THEN IF NOT NEW.enabled THEN RETURN NEW; END IF; END IF;
 IF NOT is_researcher(actor) THEN RAISE EXCEPTION 'This feature requires researcher access' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='research_interests' THEN
   IF NEW.source_type='DECLARED' AND NEW.status='SUGGESTED' THEN RAISE EXCEPTION 'Declared interests are explicitly selected, not inferred suggestions' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_researcher_feature BEFORE INSERT OR UPDATE ON user_follows FOR EACH ROW EXECUTE FUNCTION guard_researcher_feature();
CREATE TRIGGER guard_researcher_feature BEFORE INSERT OR UPDATE ON digest_preferences FOR EACH ROW EXECUTE FUNCTION guard_researcher_feature();
CREATE TRIGGER guard_researcher_feature BEFORE INSERT OR UPDATE ON research_interests FOR EACH ROW EXECUTE FUNCTION guard_researcher_feature();

ALTER TABLE research_updates ADD CONSTRAINT ck_update_target CHECK (
 (event_type IN ('OUTPUT_SHARED','OUTPUT_REVISION_RELEASED') AND output_id IS NOT NULL AND revision_id IS NOT NULL AND group_id IS NULL AND opportunity_id IS NULL AND seminar_id IS NULL AND project_id IS NULL) OR
 (event_type='OUTPUT_LINKED_TO_GROUP' AND output_id IS NOT NULL AND revision_id IS NOT NULL AND group_id IS NOT NULL AND opportunity_id IS NULL AND seminar_id IS NULL AND project_id IS NULL) OR
 (event_type='OPPORTUNITY_OPENED' AND opportunity_id IS NOT NULL AND output_id IS NULL AND revision_id IS NULL AND group_id IS NULL AND seminar_id IS NULL AND project_id IS NULL) OR
 (event_type='SEMINAR_PUBLISHED' AND seminar_id IS NOT NULL AND output_id IS NULL AND revision_id IS NULL AND group_id IS NULL AND opportunity_id IS NULL AND project_id IS NULL) OR
 (event_type='PROJECT_UPDATED' AND project_id IS NOT NULL AND output_id IS NULL AND revision_id IS NULL AND group_id IS NULL AND opportunity_id IS NULL AND seminar_id IS NULL)
);
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
  new_job_id uuid;
  queue_prefix text := COALESCE(
    NULLIF(current_setting('researchos.research_updates_queue_prefix', true), ''),
    'researchos'
  );
BEGIN
  IF EXISTS (SELECT 1 FROM research_updates WHERE event_key = p_key) THEN
    RETURN;
  END IF;

  -- Keep the scope encoding aligned with researchUpdateScope in the worker.
  INSERT INTO background_jobs (owner_id, kind, idempotency_key, payload, queue_prefix)
  VALUES (
    p_actor, 'research-update', p_key, jsonb_build_object('eventKey', p_key),
    '@research-updates:' || encode(sha256(convert_to(queue_prefix, 'UTF8')), 'hex')
  )
  ON CONFLICT (owner_id, kind, idempotency_key) DO NOTHING
  RETURNING id INTO new_job_id;
  IF NOT FOUND THEN
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
    -- The same event key may already be pending under a different actor.
    DELETE FROM background_jobs WHERE id = new_job_id;
    RETURN;
  END IF;

  -- A worker may publish a previous pending row while this insert waits.
  IF EXISTS (SELECT 1 FROM research_updates WHERE event_key = p_key) THEN
    DELETE FROM pending_research_updates WHERE job_id = new_job_id;
    DELETE FROM background_jobs WHERE id = new_job_id;
    RETURN;
  END IF;

  INSERT INTO outbox (job_id, generation) VALUES (new_job_id, 0);
END $$;

CREATE FUNCTION emit_research_update() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER emit_research_update AFTER INSERT OR UPDATE ON research_outputs FOR EACH ROW EXECUTE FUNCTION emit_research_update();
CREATE TRIGGER emit_research_update AFTER INSERT OR UPDATE ON group_output_links FOR EACH ROW EXECUTE FUNCTION emit_research_update();
CREATE TRIGGER emit_research_update AFTER INSERT OR UPDATE ON research_opportunities FOR EACH ROW EXECUTE FUNCTION emit_research_update();
CREATE TRIGGER emit_research_update AFTER INSERT OR UPDATE ON research_seminars FOR EACH ROW EXECUTE FUNCTION emit_research_update();
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Research event history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_event BEFORE UPDATE OR DELETE ON research_updates FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE FUNCTION guard_digest_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE did uuid; delivery_state delivery_status; e research_updates;
BEGIN
 IF TG_OP='UPDATE' AND NEW.delivery_id<>OLD.delivery_id THEN RAISE EXCEPTION 'Cannot move digest item to another delivery' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN did=OLD.delivery_id; ELSE did=NEW.delivery_id; END IF;
 SELECT status INTO delivery_state FROM digest_deliveries WHERE id=did FOR UPDATE;
 IF delivery_state IN ('SENT','CANCELLED') THEN RAISE EXCEPTION 'Terminal digest content is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT * INTO e FROM research_updates WHERE id=NEW.event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Digest event missing' USING ERRCODE='23503'; END IF;
 IF e.output_id IS NOT NULL THEN NEW.subject_type='OUTPUT'; NEW.subject_id=e.output_id;
 ELSIF e.opportunity_id IS NOT NULL THEN NEW.subject_type='OPPORTUNITY'; NEW.subject_id=e.opportunity_id;
 ELSIF e.seminar_id IS NOT NULL THEN NEW.subject_type='SEMINAR'; NEW.subject_id=e.seminar_id;
 ELSE NEW.subject_type='PROJECT'; NEW.subject_id=e.project_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_digest_item BEFORE INSERT OR UPDATE OR DELETE ON digest_items FOR EACH ROW EXECUTE FUNCTION guard_digest_item();
CREATE FUNCTION guard_digest_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND (NEW.status<>'PENDING' OR NEW.attempts<>0) THEN RAISE EXCEPTION 'New digest starts pending with zero attempts' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.status IN ('SENT','CANCELLED') OR (NEW.id,NEW.user_id,NEW.period_start,NEW.period_end) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.period_start,OLD.period_end) THEN
     RAISE EXCEPTION 'Terminal delivery or recipient/window identity is immutable' USING ERRCODE='23514'; END IF;
   IF NEW.attempts<OLD.attempts THEN RAISE EXCEPTION 'Attempts cannot decrease' USING ERRCODE='23514'; END IF;
   IF NEW.status='SENT' AND OLD.status<>'PROCESSING' THEN RAISE EXCEPTION 'Only a processing delivery can become sent' USING ERRCODE='23514'; END IF;
   IF NEW.status='PROCESSING' AND (OLD.status<>'PROCESSING' OR OLD.locked_until<=clock_timestamp()) AND NEW.attempts<>OLD.attempts+1 THEN
     RAISE EXCEPTION 'Each processing lease increments attempts' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='PROCESSING' AND (NEW.locked_until IS NULL OR NEW.locked_until<=clock_timestamp()) THEN RAISE EXCEPTION 'Processing requires a future lease' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('PROCESSING','SENT') THEN
   IF NOT is_researcher(NEW.user_id) OR NOT EXISTS (SELECT 1 FROM digest_preferences WHERE user_id=NEW.user_id AND enabled)
   OR NOT EXISTS (SELECT 1 FROM digest_items WHERE delivery_id=NEW.id) THEN
     RAISE EXCEPTION 'Dispatch requires eligible opted-in researcher and nonempty items' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_digest_delivery BEFORE INSERT OR UPDATE ON digest_deliveries FOR EACH ROW EXECUTE FUNCTION guard_digest_delivery();

-- Search index maintenance. The index is a plain table so a publish shows up
-- immediately instead of waiting for a refresh schedule. Triggers own it:
--   OUTPUT        indexed when the work is SHARED and the revision is the
--                 current release. The owner is the researcher themselves.
--   RESEARCHER    indexed when the group is active and not archived. A group
--                 is a public research unit, so visibility is FPTU_COMMUNITY.
--                 The owner is the group leader.
--   OPPORTUNITY   indexed when status = 'OPEN' and not archived. Visibility is
--                 FPTU_COMMUNITY - an open call for collaboration is public.
--                 The owner is the creator.
--
-- Drafts (accepted but not published), unconfirmed profiles, archived groups
-- and non-open opportunities stay out of the index by design.

-- Recomputes the OUTPUT row of the index for one work. The work's document
-- contains the author names, so every change to output_authors has to refresh
-- it; sharing a work out of the shared helper keeps both paths identical.
-- A work that is not published (or has no current release) leaves the index.
CREATE FUNCTION sync_search_index_output(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  o research_outputs%ROWTYPE;
  r output_revisions%ROWTYPE;
  authors text;
BEGIN
  SELECT * INTO o FROM research_outputs WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='OUTPUT' AND entity_id=target;
    RETURN;
  END IF;
  IF o.sharing_status<>'SHARED' THEN
    DELETE FROM search_index WHERE entity_type='OUTPUT' AND entity_id=target;
    RETURN;
  END IF;
  SELECT * INTO r FROM output_revisions WHERE id=o.current_release_id;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='OUTPUT' AND entity_id=target;
    RETURN;
  END IF;
  authors := coalesce(
    (SELECT string_agg(a.author_name_string, ' ' ORDER BY a.author_order)
       FROM output_authors a WHERE a.output_id=o.id),
    coalesce((SELECT string_agg(x->>'name', ' ') FROM jsonb_array_elements(r.authors_snapshot) x
       WHERE x ? 'name'), ''));
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('OUTPUT',o.id,r.id,o.owner_id,o.visibility,o.access_group_id,
          r.title, coalesce(r.abstract,''), authors,
          to_tsvector('simple', coalesce(r.title,'') || ' ' || coalesce(r.abstract,'') || ' ' || authors))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

-- The per-entity helpers. They hold the indexing rule of one entity type
-- each, and both the maintenance trigger and the rebuild call them, so the
-- two paths cannot drift apart.
--
-- The trigger function cannot be reused for the rebuild: it is a trigger
-- function, so it reads NEW and OLD and returns NEW. These helpers take
-- the row id and work on the row itself.
--
-- A row that must not be indexed is deleted from the index rather than
-- left alone, so a helper repairs a row that was indexed by mistake.
CREATE FUNCTION sync_researcher_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  u users%ROWTYPE;
  p researcher_profiles%ROWTYPE;
  etitle text;
BEGIN
  SELECT * INTO u FROM users WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=target;
    RETURN;
  END IF;
  SELECT * INTO p FROM researcher_profiles WHERE user_id=target;
  IF NOT FOUND OR p.profile_confirmed_at IS NULL OR u.is_active=false THEN
    DELETE FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=target;
    RETURN;
  END IF;
  etitle:=btrim(regexp_replace(coalesce(nullif(btrim(u.academic_title),''),'')||' '||u.full_name,'[[:space:]]+',' ','g'));
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('RESEARCHER',u.id,NULL,u.id,'FPTU_COMMUNITY',NULL,
          etitle, coalesce(p.bio,''), u.full_name,
          to_tsvector('simple', coalesce(etitle,'')||' '||coalesce(p.bio,'')||' '||coalesce(u.full_name,'')))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

CREATE FUNCTION sync_group_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  g research_groups%ROWTYPE;
  etitle text;
  ebody text;
  eauthors text;
BEGIN
  SELECT * INTO g FROM research_groups WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='GROUP' AND entity_id=target;
    RETURN;
  END IF;
  IF NOT g.is_active OR g.archived_at IS NOT NULL THEN
    DELETE FROM search_index WHERE entity_type='GROUP' AND entity_id=target;
    RETURN;
  END IF;
  etitle:=g.name; ebody:=coalesce(g.description,'');
  eauthors:=coalesce((SELECT usr.full_name FROM users usr WHERE usr.id=g.lead_id),'');
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('GROUP',g.id,NULL,g.lead_id,'FPTU_COMMUNITY',NULL,
          etitle, ebody, eauthors,
          to_tsvector('simple', coalesce(etitle,'')||' '||coalesce(ebody,'')||' '||coalesce(eauthors,'')))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

CREATE FUNCTION sync_opportunity_search_index(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  op research_opportunities%ROWTYPE;
  evis visibility_level;
  egroup uuid;
  etitle text;
  ebody text;
  eauthors text;
BEGIN
  SELECT * INTO op FROM research_opportunities WHERE id=target;
  IF NOT FOUND THEN
    DELETE FROM search_index WHERE entity_type='OPPORTUNITY' AND entity_id=target;
    RETURN;
  END IF;
  IF op.status<>'OPEN' OR op.archived_at IS NOT NULL THEN
    DELETE FROM search_index WHERE entity_type='OPPORTUNITY' AND entity_id=target;
    RETURN;
  END IF;
  -- An opportunity is a public job posting. The group that published it
  -- wants to attract people from outside the group, so the scope of the
  -- record does not narrow who may read it: a group-scoped opportunity is
  -- as public as a personal one. The scope still lives on the row, but it
  -- describes who published it, not who may see it.
  evis:='FPTU_COMMUNITY'; egroup:=NULL;
  etitle:=op.title; ebody:=coalesce(op.description,'');
  eauthors:=coalesce((SELECT usr.full_name FROM users usr WHERE usr.id=op.creator_id),'');
  INSERT INTO search_index(entity_type,entity_id,revision_id,owner_id,visibility,access_group_id,title,body,authors_text,doc)
  VALUES ('OPPORTUNITY',op.id,NULL,op.creator_id,evis,egroup,
          etitle, ebody, eauthors,
          to_tsvector('simple', coalesce(etitle,'')||' '||coalesce(ebody,'')||' '||coalesce(eauthors,'')))
  ON CONFLICT (entity_type,entity_id) DO UPDATE SET
    revision_id=EXCLUDED.revision_id, owner_id=EXCLUDED.owner_id, visibility=EXCLUDED.visibility,
    access_group_id=EXCLUDED.access_group_id, title=EXCLUDED.title, body=EXCLUDED.body,
    authors_text=EXCLUDED.authors_text, doc=EXCLUDED.doc, updated_at=clock_timestamp();
END $$;

CREATE FUNCTION sync_search_index() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o research_outputs%ROWTYPE;
BEGIN
  -- The trigger dispatches to the per-entity helpers, which hold the rule
  -- for each type. The helpers work on a row id, so the rebuild below can
  -- call exactly the same code.
  IF TG_TABLE_NAME='output_revisions' THEN
    SELECT * INTO o FROM research_outputs WHERE id=NEW.output_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
    -- Only the current release of a shared work is indexed. Any other
    -- revision leaves the index row alone.
    IF o.sharing_status<>'SHARED' OR o.current_release_id IS DISTINCT FROM NEW.id THEN RETURN NEW; END IF;
    PERFORM sync_search_index_output(o.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='research_outputs' THEN
    PERFORM sync_search_index_output(NEW.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='users' THEN
    PERFORM sync_researcher_search_index(NEW.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='researcher_profiles' THEN
    PERFORM sync_researcher_search_index(NEW.user_id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='research_groups' THEN
    PERFORM sync_group_search_index(NEW.id);
    RETURN NEW;
  ELSIF TG_TABLE_NAME='research_opportunities' THEN
    PERFORM sync_opportunity_search_index(NEW.id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_search_index AFTER INSERT OR UPDATE ON output_revisions FOR EACH ROW EXECUTE FUNCTION sync_search_index();
CREATE TRIGGER sync_search_index AFTER INSERT OR UPDATE ON research_outputs FOR EACH ROW EXECUTE FUNCTION sync_search_index();
CREATE TRIGGER sync_search_index AFTER INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION sync_search_index();
CREATE TRIGGER sync_search_index AFTER INSERT OR UPDATE ON researcher_profiles FOR EACH ROW EXECUTE FUNCTION sync_search_index();
CREATE TRIGGER sync_search_index AFTER INSERT OR UPDATE ON research_groups FOR EACH ROW EXECUTE FUNCTION sync_search_index();
CREATE TRIGGER sync_search_index AFTER INSERT OR UPDATE ON research_opportunities FOR EACH ROW EXECUTE FUNCTION sync_search_index();
CREATE TRIGGER sync_search_index_ri BEFORE UPDATE ON search_index FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- The search document of a work contains its author names, so a change to the
-- author list has to rebuild the document. Without this, an added name stays
-- unsearchable and a removed name keeps matching until the next output update.
CREATE FUNCTION sync_search_index_output_authors() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM sync_search_index_output(OLD.output_id);
    RETURN OLD;
  END IF;
  PERFORM sync_search_index_output(NEW.output_id);
  -- An update may move an author to another work; both documents then change.
  IF TG_OP='UPDATE' AND OLD.output_id IS DISTINCT FROM NEW.output_id THEN
    PERFORM sync_search_index_output(OLD.output_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_search_index_authors AFTER INSERT OR UPDATE OR DELETE ON output_authors
 FOR EACH ROW EXECUTE FUNCTION sync_search_index_output_authors();

-- Source-row deletes remove the index row. entity_id has no foreign key
-- because it is polymorphic, so the delete has to be handled explicitly.
CREATE FUNCTION sync_search_index_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM search_index WHERE entity_type=TG_ARGV[0]::search_entity_type AND entity_id=OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER sync_search_index_del AFTER DELETE ON research_outputs FOR EACH ROW EXECUTE FUNCTION sync_search_index_delete('OUTPUT');
CREATE TRIGGER sync_search_index_del AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION sync_search_index_delete('RESEARCHER');
CREATE TRIGGER sync_search_index_del AFTER DELETE ON research_groups FOR EACH ROW EXECUTE FUNCTION sync_search_index_delete('GROUP');
CREATE TRIGGER sync_search_index_del AFTER DELETE ON research_opportunities FOR EACH ROW EXECUTE FUNCTION sync_search_index_delete('OPPORTUNITY');

-- Deleting the profile of a retained user also has to clean up the index.
-- The delete trigger on users only fires when the account itself goes away;
-- a researcher profile can be removed while the account stays, and the
-- profile's bio, title and search document would otherwise stay public.
CREATE FUNCTION sync_search_index_delete_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM search_index WHERE entity_type='RESEARCHER' AND entity_id=OLD.user_id;
  RETURN OLD;
END $$;
CREATE TRIGGER sync_search_index_profile_del AFTER DELETE ON researcher_profiles
 FOR EACH ROW EXECUTE FUNCTION sync_search_index_delete_profile();

-- Integrity check for the polymorphic entity reference.
CREATE FUNCTION guard_search_index_entity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_type='OUTPUT' AND NOT EXISTS (SELECT 1 FROM research_outputs WHERE id=NEW.entity_id) THEN
    RAISE EXCEPTION 'Search index OUTPUT points at a missing work' USING ERRCODE='23503'; END IF;
  IF NEW.entity_type='RESEARCHER' AND NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.entity_id) THEN
    RAISE EXCEPTION 'Search index RESEARCHER points at a missing user' USING ERRCODE='23503'; END IF;
  IF NEW.entity_type='GROUP' AND NOT EXISTS (SELECT 1 FROM research_groups WHERE id=NEW.entity_id) THEN
    RAISE EXCEPTION 'Search index GROUP points at a missing group' USING ERRCODE='23503'; END IF;
  IF NEW.entity_type='OPPORTUNITY' AND NOT EXISTS (SELECT 1 FROM research_opportunities WHERE id=NEW.entity_id) THEN
    RAISE EXCEPTION 'Search index OPPORTUNITY points at a missing opportunity' USING ERRCODE='23503'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_search_index BEFORE INSERT OR UPDATE ON search_index FOR EACH ROW EXECUTE FUNCTION guard_search_index_entity();

-- Rebuilds the whole search index from the source tables.
--
-- The triggers keep the index up to date, but they only ever see the rows
-- written *after* they exist. A row written before the trigger was created,
-- or while the trigger was missing, would stay out of the index for ever and
-- there would be no way to get it back. This function is that way back: it
-- recomputes every indexable row from the source tables.
--
-- It calls the same per-entity helpers as the maintenance trigger, so the
-- rebuilt index is the index the triggers would have produced. Running it
-- twice leaves the same rows in place: it is an upsert per row, keyed on
-- (entity_type, entity_id).
--
-- Rows that must not be indexed are removed rather than left alone, so a
-- rebuild also repairs an index that holds a row it should not.
--
-- The function reads the source tables and writes only search_index, so it
-- never fires the maintenance triggers and never changes any other data.
CREATE FUNCTION rebuild_search_index() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  -- Remove the rows that no longer belong in the index. A row that is not
  -- backed by an indexable source row is stale, whatever wrote it.
  DELETE FROM search_index s
   WHERE NOT EXISTS (
     SELECT 1 FROM research_outputs o
      WHERE s.entity_type='OUTPUT' AND o.id=s.entity_id
        AND o.sharing_status='SHARED' AND o.current_release_id IS NOT NULL)
     AND NOT EXISTS (
     SELECT 1 FROM users u JOIN researcher_profiles p ON p.user_id=u.id
      WHERE s.entity_type='RESEARCHER' AND u.id=s.entity_id
        AND u.is_active AND p.profile_confirmed_at IS NOT NULL)
     AND NOT EXISTS (
     SELECT 1 FROM research_groups g
      WHERE s.entity_type='GROUP' AND g.id=s.entity_id
        AND g.is_active AND g.archived_at IS NULL)
     AND NOT EXISTS (
     SELECT 1 FROM research_opportunities op
      WHERE s.entity_type='OPPORTUNITY' AND op.id=s.entity_id
        AND op.status='OPEN' AND op.archived_at IS NULL);

  -- Recompute every indexable row. The helper deletes the row for an entity
  -- that must not be indexed, so a draft that was indexed by mistake leaves
  -- the index here too.
  FOR r IN SELECT id FROM research_outputs LOOP
    PERFORM sync_search_index_output(r.id);
  END LOOP;
  FOR r IN SELECT id FROM users WHERE is_active LOOP
    PERFORM sync_researcher_search_index(r.id);
  END LOOP;
  FOR r IN SELECT id FROM research_groups WHERE is_active AND archived_at IS NULL LOOP
    PERFORM sync_group_search_index(r.id);
  END LOOP;
  FOR r IN SELECT id FROM research_opportunities WHERE status='OPEN' AND archived_at IS NULL LOOP
    PERFORM sync_opportunity_search_index(r.id);
  END LOOP;
END $$;

-- Provenance rules (RES-14, RES-140). The CHECK constraints on
-- field_provenance itself enforce the verification rules:
-- ck_field_provenance_unk_unverified (UNK is never VERIFIED) and
-- ck_field_provenance_no_auto_verify (AI_INF is never auto-promoted; only
-- a human confirmation, which sets is_locked, may stamp verified_at).
-- This trigger enforces the remaining rule — the lock — which no CHECK
-- can express because it spans rows: once a human confirms a field value
-- (is_locked), a sync job must never overwrite that field again. The
-- override direction is one-way, human wins over machine.
--
-- A sync write is any row written with is_locked = false. It is rejected
-- when a locked row already exists for the same (entity_type, entity_id,
-- field_name), whatever its source_ref: the PK keeps per-origin history,
-- so a re-sync under a new source_ref is still an overwrite of the field.
--
-- The human path always carries is_locked = true (confirmField), so it
-- passes the INSERT guard, and an UPDATE of an already-locked row may
-- only touch is_locked/verified_at — re-confirming, never re-sourcing.
CREATE FUNCTION guard_field_provenance_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NOT NEW.is_locked AND EXISTS (
     SELECT 1 FROM field_provenance
     WHERE entity_type=NEW.entity_type AND entity_id=NEW.entity_id
       AND field_name=NEW.field_name AND is_locked
   ) THEN
     RAISE EXCEPTION 'Field is locked by a human confirmation; sync must not overwrite it' USING ERRCODE='23514';
   END IF;
   RETURN NEW;
 END IF;
 IF OLD.is_locked THEN
   IF (NEW.entity_type,NEW.entity_id,NEW.field_name,NEW.source,NEW.source_ref,NEW.synced_at)
      IS DISTINCT FROM
      (OLD.entity_type,OLD.entity_id,OLD.field_name,OLD.source,OLD.source_ref,OLD.synced_at) THEN
     RAISE EXCEPTION 'Field is locked by a human confirmation; sync must not overwrite it' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_field_provenance_lock BEFORE INSERT OR UPDATE ON field_provenance
 FOR EACH ROW EXECUTE FUNCTION guard_field_provenance_lock();
