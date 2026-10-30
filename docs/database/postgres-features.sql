-- PostgreSQL supplement to ResearchOS.dbml. Build into ResearchOS.sql, not standalone.
-- Predicates take a TRUSTED backend actor. They are not RLS or SQL authentication.
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
CREATE FUNCTION can_manage_opportunity(actor uuid, target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT is_researcher(actor) AND EXISTS (SELECT 1 FROM research_opportunities o WHERE o.id=target
 AND (o.group_id IS NOT NULL OR o.project_id IS NOT NULL OR o.creator_id=actor)
 AND (o.group_id IS NULL OR can_manage_group(actor,o.group_id))
 AND (o.project_id IS NULL OR EXISTS (SELECT 1 FROM research_projects p WHERE p.id=o.project_id AND p.lead_id=actor AND p.archived_at IS NULL)));
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
CREATE FUNCTION visible_group_output_releases(actor uuid,target_group uuid) RETURNS SETOF group_output_releases LANGUAGE sql STABLE AS $$
 SELECT r.* FROM group_output_releases r WHERE r.group_id=target_group AND can_view_output(actor,r.output_id);
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
CREATE FUNCTION emit_research_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind research_update_type; actor uuid;
BEGIN
 IF TG_TABLE_NAME='research_outputs' THEN
   IF NEW.sharing_status='SHARED' AND (TG_OP='INSERT' OR OLD.first_shared_at IS NULL OR NEW.current_release_id IS DISTINCT FROM OLD.current_release_id) THEN
     kind=CASE WHEN TG_OP='INSERT' OR OLD.first_shared_at IS NULL THEN 'OUTPUT_SHARED'::research_update_type ELSE 'OUTPUT_REVISION_RELEASED'::research_update_type END;
     SELECT released_by INTO actor FROM output_revisions WHERE id=NEW.current_release_id;
     INSERT INTO research_updates(event_key,event_type,actor_id,output_id,revision_id)
     VALUES ('output:'||NEW.id||':'||NEW.current_release_id,kind,actor,NEW.id,NEW.current_release_id) ON CONFLICT(event_key) DO NOTHING;
   END IF;
 ELSIF TG_TABLE_NAME='group_output_links' THEN
   IF NEW.accepted_revision_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.accepted_revision_id IS DISTINCT FROM OLD.accepted_revision_id) THEN
     INSERT INTO research_updates(event_key,event_type,actor_id,output_id,revision_id,group_id)
     VALUES ('group:'||NEW.group_id||':'||NEW.output_id||':'||NEW.accepted_revision_id,'OUTPUT_LINKED_TO_GROUP',NEW.accepted_by,NEW.output_id,NEW.accepted_revision_id,NEW.group_id) ON CONFLICT(event_key) DO NOTHING;
   END IF;
 ELSIF TG_TABLE_NAME='research_opportunities' THEN
   IF NEW.status='OPEN' AND (TG_OP='INSERT' OR OLD.published_at IS NULL) THEN
     INSERT INTO research_updates(event_key,event_type,actor_id,opportunity_id)
     VALUES ('opportunity:'||NEW.id,'OPPORTUNITY_OPENED',NEW.creator_id,NEW.id) ON CONFLICT(event_key) DO NOTHING;
   END IF;
 ELSIF TG_TABLE_NAME='research_seminars' THEN
   IF NEW.published_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.published_at IS NULL) THEN
     INSERT INTO research_updates(event_key,event_type,actor_id,seminar_id)
     VALUES ('seminar:'||NEW.id,'SEMINAR_PUBLISHED',NEW.organizer_id,NEW.id) ON CONFLICT(event_key) DO NOTHING;
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
