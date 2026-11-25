BEGIN;

-- RES-176: a reader asks the Article owner for one exact Private file.
-- Approval issues a separate grant. Requests and grants keep their history:
-- state changes are updates, never deletes.

CREATE TYPE file_access_request_status AS ENUM (
  'PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'CANCELLED'
);

CREATE TABLE file_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  output_id uuid NOT NULL,
  file_id uuid NOT NULL,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status file_access_request_status NOT NULL DEFAULT 'PENDING',
  message varchar(1000),
  response varchar(1000),
  decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  cancel_reason varchar(32),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_file_access_request_file FOREIGN KEY (output_id, file_id)
    REFERENCES output_files(output_id, id) ON DELETE RESTRICT,
  -- Lets a grant reference the exact requester and file it was approved for.
  CONSTRAINT uq_file_access_request_identity UNIQUE (id, file_id, requester_id),
  CONSTRAINT ck_file_access_request_text CHECK (
    (message IS NULL OR length(btrim(message)) > 0)
    AND (response IS NULL OR length(btrim(response)) > 0)
  ),
  CONSTRAINT ck_file_access_request_decision CHECK (
    (status = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status <> 'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT ck_file_access_request_withdrawal CHECK (
    status <> 'WITHDRAWN' OR decided_by = requester_id
  ),
  CONSTRAINT ck_file_access_request_response CHECK (
    response IS NULL OR status IN ('APPROVED', 'DECLINED')
  ),
  CONSTRAINT ck_file_access_request_cancel CHECK (
    (status = 'CANCELLED') = (cancel_reason IS NOT NULL)
  )
);

COMMENT ON TABLE file_access_requests IS 'A reader''s request for one exact Private output file. At most one pending request per requester and file.';

CREATE UNIQUE INDEX uq_file_access_request_pending
  ON file_access_requests(file_id, requester_id) WHERE status = 'PENDING';
CREATE INDEX idx_file_access_requests_requester
  ON file_access_requests(requester_id, created_at DESC, id DESC);
CREATE INDEX idx_file_access_requests_output
  ON file_access_requests(output_id, created_at DESC, id DESC);
CREATE INDEX idx_file_access_requests_decided_by ON file_access_requests(decided_by);

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON file_access_requests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- A decided request is final, and its identity never changes.
CREATE FUNCTION guard_file_access_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   RAISE EXCEPTION 'File access requests are kept as history' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'INSERT' AND NEW.status <> 'PENDING' THEN
   RAISE EXCEPTION 'A new file access request must be pending' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'UPDATE' THEN
   IF (NEW.output_id, NEW.file_id, NEW.requester_id, NEW.message, NEW.created_at)
      IS DISTINCT FROM (OLD.output_id, OLD.file_id, OLD.requester_id, OLD.message, OLD.created_at) THEN
     RAISE EXCEPTION 'File access request identity is immutable' USING ERRCODE = '23514';
   END IF;
   IF OLD.status <> 'PENDING' AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
     RAISE EXCEPTION 'A decided file access request is final' USING ERRCODE = '23514';
   END IF;
 END IF;
 RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER guard_file_access_request BEFORE INSERT OR UPDATE OR DELETE ON file_access_requests
  FOR EACH ROW EXECUTE FUNCTION guard_file_access_request();

CREATE TABLE file_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  file_id uuid NOT NULL,
  grantee_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  granted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  CONSTRAINT fk_file_access_grant_request FOREIGN KEY (request_id, file_id, grantee_id)
    REFERENCES file_access_requests(id, file_id, requester_id) ON DELETE RESTRICT,
  CONSTRAINT ck_file_access_grant_revocation CHECK (
    (revoked_by IS NULL) = (revoked_at IS NULL)
  )
);

COMMENT ON TABLE file_access_grants IS 'Access to one exact Private file, issued by approving a request. Revocation is final; a new request issues a new grant.';

CREATE UNIQUE INDEX uq_file_access_grant_active
  ON file_access_grants(file_id, grantee_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_file_access_grants_grantee ON file_access_grants(grantee_id);
CREATE INDEX idx_file_access_grants_granted_by ON file_access_grants(granted_by);
CREATE INDEX idx_file_access_grants_revoked_by ON file_access_grants(revoked_by);

-- A grant comes only from an approved request, and only revocation may change it.
CREATE FUNCTION guard_file_access_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   RAISE EXCEPTION 'File access grants are kept as history' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'INSERT' THEN
   IF NEW.revoked_at IS NOT NULL OR NOT EXISTS (
     SELECT 1 FROM file_access_requests r
     WHERE r.id = NEW.request_id AND r.status = 'APPROVED' AND r.decided_by = NEW.granted_by
   ) THEN
     RAISE EXCEPTION 'A grant requires its approved request' USING ERRCODE = '23514';
   END IF;
 END IF;
 IF TG_OP = 'UPDATE' THEN
   IF (NEW.id, NEW.request_id, NEW.file_id, NEW.grantee_id, NEW.granted_by, NEW.granted_at)
      IS DISTINCT FROM (OLD.id, OLD.request_id, OLD.file_id, OLD.grantee_id, OLD.granted_by, OLD.granted_at) THEN
     RAISE EXCEPTION 'File access grant identity is immutable' USING ERRCODE = '23514';
   END IF;
   IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_by, NEW.revoked_at)
      IS DISTINCT FROM (OLD.revoked_by, OLD.revoked_at) THEN
     RAISE EXCEPTION 'A revoked grant stays revoked' USING ERRCODE = '23514';
   END IF;
 END IF;
 RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER guard_file_access_grant BEFORE INSERT OR UPDATE OR DELETE ON file_access_grants
  FOR EACH ROW EXECUTE FUNCTION guard_file_access_grant();

-- The shared download policy. Existing owner, community and group rules are
-- unchanged. A grant is a separate rule: it opens only an available Private
-- file attached to the Article's current release, for a reader who can still
-- view the Article. It never reaches revisions pinned by groups.
CREATE OR REPLACE FUNCTION can_view_output_file(actor uuid, target_file uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM output_files f JOIN research_outputs o ON o.id=f.output_id
 WHERE f.id=target_file AND f.is_available AND can_view_output(actor,o.id)
 AND (
   ((o.owner_id=actor OR (f.visibility='FPTU_COMMUNITY' OR (f.visibility='RESEARCH_GROUP' AND is_group_member(actor,f.access_group_id))))
    AND (o.owner_id=actor OR EXISTS (SELECT 1 FROM output_revision_files rf WHERE rf.file_id=f.id AND
     (rf.revision_id=o.current_release_id OR EXISTS (SELECT 1 FROM group_output_releases g WHERE g.output_id=o.id AND g.id=rf.revision_id)))))
   OR (f.visibility='PRIVATE'
    AND EXISTS (SELECT 1 FROM output_revision_files rf WHERE rf.file_id=f.id AND rf.revision_id=o.current_release_id)
    AND EXISTS (SELECT 1 FROM file_access_grants g WHERE g.file_id=f.id AND g.grantee_id=actor AND g.revoked_at IS NULL))
 ));
$$;

COMMIT;

